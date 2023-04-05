import * as events from 'events'
import axios, { Method, AxiosRequestConfig, AxiosResponse } from 'axios';
import * as log4js from 'log4js'
import * as cheerio from 'cheerio'
import * as pq from 'priority-queue'
import * as dataCache from "cache"

// 模拟浏览器信息
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36";
axios.defaults.timeout = 5000
axios.defaults.headers.common = {
  'User-Agent': UA,
  //cookie: Cookie,
  //referer: 'https://ark-funds.com/arkk',
  //accept: 'application/json, text/javascript, */*; q=0.01',
  //'accept-encoding': 'gzip, deflate, br',
  //'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,cy;q=0.6,zh-TW;q=0.5,mt;q=0.4,fr;q=0.3,ja;q=0.2,hu;q=0.1,pl;q=0.1,pt;q=0.1',
  //'sec-fetch-mode': 'cors',
  //'sec-fetch-site': 'same-origin',
}

enum SessionStatus {
  Idle = 1,
  Running,
  Sleeping
}

interface AnyMap {
  [propName: string]: any;
}

interface GroupNameOptions {
  groupName: string;
}

interface PriorityOptions {
  priority: number;
}

interface GroupOptions {
  groupVars?: AnyMap, //user define group vars
  jQuery?: boolean,
  method?: Method,
  priority?: number,
  waitBefore?: number,
  referer?: boolean | string,
  retries?: number,
  retryTimeout?: number,
  timeout?: number,
  cacheTtl?: number
}

interface SessionOptions extends AxiosRequestConfig {
  waitBefore?: number,
  sessionVars?: AnyMap, //user define session vars
}

interface Session {
  sessionName: string,
  options: SessionOptions,
}

interface _Session {
  options: SessionOptions,
  status: SessionStatus,
  lastStartTs: number,
  lastEndTs: number,
}

interface _SessionMap {
  [propName: string]: _Session
}

interface _Group {
  options: GroupOptions;
  queue: pq.PriorityQueue;
  sessions: _SessionMap;
  retries: number; //需要重试的有几个
}

interface _GroupMap {
  [propName: string]: _Group;
}

export interface Group {
  groupName: string,
  options: GroupOptions,
  sessions: Session[],
  tasks: TaskOptions[]
}

export interface CResponse extends AxiosResponse {
  charset?: string
  $?: any
}

export type TaskOptions = AxiosRequestConfig & AnyMap;

export interface CrawlerOptions {
  runForever?: boolean
  log?: log4js.Logger;
  logLevel?: string;
}

const cache = new dataCache.DataCache({})
const replacer = (key: string, value: any) =>
value instanceof Object && !(value instanceof Array) ? 
    Object.keys(value)
    .sort()
    .reduce((sorted: any, key) => {
        sorted[key] = value[key];
        return sorted 
    }, {}) :
    value;

//https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
const hash = (str: string, seed: number = 0) => {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export class Crawler {
  private e: events.EventEmitter;
  private options: CrawlerOptions;
  private groups: _GroupMap;
  private comparator: (a: any, b: any) => boolean;
  public log: log4js.Logger;
  constructor(e: events.EventEmitter, options: CrawlerOptions) {
    let defaultOptions = {
      runForever: true
    };

    this.e = e;

    // default is the default kind options and also the global options
    this.options = options ? { ...defaultOptions, ...options } : defaultOptions;
    if (this.options.log) {
      this.log = this.options.log;
      delete this.options['log'];
    } else {
      this.log = log4js.getLogger('crawler');
      this.log.level = options.logLevel? options.logLevel: 'info';
    }

    //数字越小优先级越高
    this.comparator = function (a: PriorityOptions, b: PriorityOptions) {
      return a.priority < b.priority;
    };

    this.groups = {}

    this._onSchedule();
    this._onGroup();
    this._onSession();
    this._onAdd();
    this._onClear();

    if (this.options.runForever) {
      setInterval(() => {
        let used = process.memoryUsage().heapUsed / 1024 / 1024;
        this.log.info(`The script uses approximately ${Math.round(used * 100) / 100} MB`);
      }, 600000);
    }
  }

  private _onSchedule() {
    this.e.on('schedule', (groupName: string) => {
      let group = this.groups[groupName];

      if (group.queue.isEmpty()) {
        if (group.retries == 0) {
          //drain
          this.e.emit('drain' + groupName)
        }
        return
      }

      for (let sessionName in group.sessions) {
        if (group.sessions[sessionName].status != SessionStatus.Idle) {
          continue;
        }

        let session = group.sessions[sessionName];

        session.status = SessionStatus.Sleeping;
        let options = group.queue.pop();
        options.sessionName = sessionName;
        let timeout = options.waitBefore + session.lastEndTs - Date.now();
        timeout = timeout > 0 ? timeout: 0;
        setTimeout(() => {
          session.status = SessionStatus.Running;
          options = { ...session.options, ...options }
          this._doTask(options);
        }, timeout);

        return;
      }
    });
  }

  private _onGroup() {
    this.e.on('group', (groupName: string, options: GroupOptions | null) => {
      let defaultOptions: GroupOptions = {
        jQuery: false,
        method: 'get',
        priority: 100,
        waitBefore: 1,
        referer: false,
        retries: 1,
        retryTimeout: 100,
        timeout: 5000
      };

      if (!this.groups[groupName]) {
        this.groups[groupName] = {
          queue: new pq.PriorityQueue(this.comparator),
          options: defaultOptions,
          sessions: {},
          retries: 0
        }
      }

      this.groups[groupName].options = options ? { ...defaultOptions, ...options } : defaultOptions;
    });
  }

  //session不继承instance参数
  private _onSession() {
    this.e.on('session', (groupName: string, sessionName: string, options: SessionOptions) => {
      if (this.groups[groupName].sessions[sessionName]) {
        this.groups[groupName].sessions[sessionName].options = options;
      } else {
        this.groups[groupName].sessions[sessionName] = {
          options: options,
          status: SessionStatus.Idle,
          lastStartTs: 0,
          lastEndTs: 0
        };
      }

    });
  }

  private _onAdd() {
    this.e.on('add', (groupName: string, options: TaskOptions) => {
      if (!this.groups[groupName]) {
        this.log.error('please check the groupName of options', groupName);
        return;
      }

      this._add2Queue(groupName, options);
      return;
    });
  }

  private _onClear() {
    this.e.on('clear', (groupName: string) => {
      //clear queue
      let queue = this.groups[groupName].queue;
      while (!queue.isEmpty)
        queue.pop();
    });
  }


  private _add2Queue(groupName: string, options: TaskOptions) {
    options = { ...this.groups[groupName].options, ...options };
    options.groupName = groupName;
    this.groups[groupName].queue.push(options);
    //this.log('_add2Queue', JSON.stringify(options));
    this.e.emit('schedule', groupName);
  }

  private _doTask(options: TaskOptions) {
    if (!options.headers) { options.headers = {}; }
    if (options.forceUTF8) { options.encoding = null; }
    // specifying json in request will have request sets body to JSON representation of value and 
    // adds Content-type: application/json header. Additionally, parses the response body as JSON
    // so the response will be JSON object, no need to deal with encoding
    if (options.json) { options.encoding = null; }
    if (options.userAgent) {
      options.headers['User-Agent'] = options.userAgent;
    }

    if (options.referer) {
      options.headers.Referer = options.referer;
    }

    if (options.proxies && options.proxies.length) {
      options.proxy = options.proxies[0];
    }

    if (!options.preRequest) {
      return this._doRequest(options);
    }

    options.preRequest(options)
      .then((cancel: boolean): void => {
        if (cancel) return;

        this._doRequest(options);
      }).catch((error: string) => {
        this.log.error("preRequest Catch Error:", error);
      });
  };

  private _doRequest(options: TaskOptions) {

    if (options.skipEventRequest !== true) {
      this.e.emit('request', options);
    }

    var requestArgs: string[] = ['url', 'method', 'headers', 'params', 'data', 'timeout', 'withCredentials', 'auth', 'responseType', 'responseEncoding', 'xsrfCookieName', 'maxRedirects', 'httpAgent', 'httpsAgent', 'proxy', 'decompress'];
    //let opts: request.UriOptions & Options = { uri: ropts.uri };
    let ropts: AxiosRequestConfig = { url: options.url }
    for (let opt of requestArgs) {
      // @ts-ignore
      ropts[opt] = options[opt];
    }

    let session = this.groups[options.groupName].sessions[options.sessionName];
    session.lastStartTs = Date.now()
    session.lastEndTs = 0
    if (options.cacheTtl) {
      let key = hash(JSON.stringify(ropts, replacer)).toString()
      cache.get(key, (retrieved: dataCache.Retrieved) => {
        axios(ropts)
          .then((res: any) => {
            session.lastEndTs = Date.now()
            if (options.params) {
              this.log.debug(options.method, options.url, options.headers, JSON.stringify(options.params), res)
            } else {
              this.log.debug(options.method, options.url, options.headers, res)
            }
            //this._onContent(options, res)
            retrieved(key, {res: res}, options.cacheTtl)
          })
          .catch((error: Error) => {
            session.lastEndTs = Date.now()
            retrieved(key, {error: error}, 0)
          })
      },  (value: any) => {
        if (value.error) {
          this.log.error(value.error + JSON.stringify(options.params) + ' when fetching ' + options.url + (options.retries ? ' (' + options.retries + ' retries left)' : ''))
          if (options.retries) {
            this.groups[options.groupName].retries++;
            setTimeout(() => {
              options.retries--;
              this._add2Queue(options.groupName, options);
              this.groups[options.groupName].retries--;
            }, options.retryTimeout);
          } else if (options.callback) {
            options.callback(value.error, options);
          } else if (options.error) {
            options.error(value.error, options);
          }
        } else {
          this._onContent(options, value.res)
        }
        
        session.status = SessionStatus.Idle
        this.e.emit('schedule', options.groupName)
      })
    } else {
      axios(ropts)
      .then((res: any) => {
        session.lastEndTs = Date.now()
        if (options.params) {
          this.log.debug(options.method, options.url, options.headers, JSON.stringify(options.params), res)
        } else {
          this.log.debug(options.method, options.url, options.headers, res)
        }
        this._onContent(options, res)
      })
      .catch((error: Error) => {
        if (!session.lastEndTs) {
          session.lastEndTs = Date.now()
        }
        this.log.error(error + JSON.stringify(options.params) + ' when fetching ' + options.url + (options.retries ? ' (' + options.retries + ' retries left)' : ''))
        if (options.retries) {
          this.groups[options.groupName].retries++;
          setTimeout(() => {
            options.retries--;
            this._add2Queue(options.groupName, options);
            this.groups[options.groupName].retries--;
          }, options.retryTimeout);
        }  else if (options.callback) {
          options.callback(error, options);
        } else if (options.error) {
          options.error(error, options);
        }
      }).finally(() => {
        session.status = SessionStatus.Idle
        this.e.emit('schedule', options.groupName)
      })
    }
  };

  private _onContent(options: TaskOptions, res: AxiosResponse) {
    if (!res.data) { res.data = ''; }

    if (options.method === 'HEAD' || !options.jQuery) {
      if (options.callback) {
        return options.callback(null, options, res);
      } else {
        return options.success(options, res);
      }
    }

    var injectableTypes = ['html', 'xhtml', 'text/xml', 'application/xml', '+xml']
    if (!options.html && !injectableTypes.includes(res.headers['content-type'].split(';')[0].trim())) {
      this.log.warn('response body is not HTML, skip injecting. Set jQuery to false to suppress this message', res.headers['content-type']);
      if (options.callback) {
        return options.callback(null, options, res);
      } else {
        return options.success(options, res);
      }
    }

    this._inject(options, res);
  };

  private _inject(options: TaskOptions, res: CResponse) {
    let $;
    let defaultCheerioOptions = {
      normalizeWhitespace: false,
      xmlMode: false,
      decodeEntities: true
    };
    let cheerioOptions = options.jQuery.options || defaultCheerioOptions;
    try {
      $ = cheerio.load(res.data, cheerioOptions);
      res.$ = $;
    } catch (e) {
      this.log.error('cheerio.load error', e);
    }

    if (options.callback) {
      return options.callback(null, options, res);
    } else {
      return options.success(options, res);
    }
  }
}
