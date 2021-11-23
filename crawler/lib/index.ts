import * as events from 'events'
import axios, { Method, AxiosRequestConfig, AxiosResponse } from 'axios';
import * as log4js from 'log4js'
import * as cheerio from 'cheerio'
import * as pq from 'priority-queue'
import { data } from 'jquery';

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
  timeout?: number
}

interface SessionOptions extends ax.AxiosRequestConfig {
  waitBefore?: number,
  sessionVars?: AnyMap, //user define group vars
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
  retries: number;
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
}

function contentType(res: AxiosResponse) {
  return get(res, 'content-type').split(';').filter((item: string) => item.trim().length !== 0).join(';');
}

function get(res: AxiosResponse, field: string): any {
  return res.headers[field.toLowerCase()] || '';
}

export class Crawler {
  e: events.EventEmitter;
  protected options: CrawlerOptions;
  protected groups: _GroupMap;
  comparator: (a: any, b: any) => boolean;
  log: log4js.Logger;
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
      this.log.level = 'debug';
    }


    this.comparator = function (a: PriorityOptions, b: PriorityOptions) {
      return a.priority < b.priority;
    };

    this.groups = {}

    this._request = {};
    this._request['GET'] = request.get;
    this._request['POST'] = request.post;

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

  _onSchedule() {
    this.e.on('schedule', (groupName: string) => {
      let group = this.groups[groupName];

      if (group.queue.isEmpty() && group.retries == 0) {
        //drain
        this.e.emit('drain' + groupName);
        return;
      }

      for (let sessionName in group.sessions) {
        if (group.sessions[sessionName].status != SessionStatus.Idle) {
          continue;
        }

        let session = group.sessions[sessionName];

        session.status = SessionStatus.Sleeping;
        let options = group.queue.pop();
        options.sessionName = sessionName;
        let timeout = options.waitBefore;
        setTimeout(() => {
          session.status = SessionStatus.Running;
          options = { ...session.options, ...options }
          this._doTask(options);
        }, timeout);

        return;
      }
    });
  }

  _onGroup() {
    this.e.on('group', (groupName: string, options: GroupOptions | null) => {
      let defaultOptions: GroupOptions = {
        jQuery: false,
        method: 'get',
        priority: 100,
        waitBefore: 1000,
        referer: false,
        retries: 3,
        retryTimeout: 10000,
        timeout: 30000
      };

      if (!this.groups[groupName]) {
        this.groups[groupName] = {
          queue: new pq.PriorityQueue(),
          options: defaultOptions,
          sessions: {},
          retries: 0
        }
      }

      this.groups[groupName].options = options ? { ...defaultOptions, ...options } : defaultOptions;
    });
  }

  //session不继承instance参数
  _onSession() {
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

  _onAdd() {
    this.e.on('add', (groupName: string, options: TaskOptions) => {
      if (!this.groups[groupName]) {
        this.log.error('please check the groupName of options', groupName);
        return;
      }

      this._add2Queue(groupName, options);
      return;
    });
  }

  _onClear() {
    this.e.on('clear', (groupName: string) => {
      //clear queue
      let queue = this.groups[groupName].queue;
      while (!queue.isEmpty)
        queue.pop();
    });
  }


  _add2Queue(groupName: string, options: TaskOptions) {
    options = { ...this.groups[groupName].options, ...options };
    options.groupName = groupName;
    this.groups[groupName].queue.push(options);
    //this.log('_add2Queue', JSON.stringify(options));
    this.e.emit('schedule', groupName);
  }

  _doTask(options: TaskOptions) {
    if (options.proxy)
      this.log.info('Use proxy', options.proxy);

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

  _doRequest(options: TaskOptions) {

    if (options.skipEventRequest !== true) {
      this.e.emit('request', options);
    }

    if (options.params) {
      this.log.info(options.method, options.uri, JSON.stringify(options.params));
    } else {
      this.log.info(options.method, options.uri);
    }

    var requestArgs: string[] = ['url', 'method', 'headers', 'params', 'data', 'timeout', 'withCredentials', 'auth', 'responseType', 'responseEncoding', 'xsrfCookieName', 'maxRedirects', 'httpAgent', 'httpsAgent', 'proxy', 'decompress'];
    //let opts: request.UriOptions & Options = { uri: ropts.uri };
    let ropts: AxiosRequestConfig = { url: options.url }
    for (let opt of requestArgs) {
      // @ts-ignore
      ropts[opt] = options[opt];
    }

    //this.log('_doRequest', JSON.stringify(ropts));
    let session = this.groups[options.groupName].sessions[options.sessionName];
    session.lastStartTs = Date.now()
    axios(ropts)
      .then((resp: any) => {
        session.lastEndTs = Date.now()
        this._onContent(error, options, response);
        session.status = SessionStatus.Idle;
        this.e.emit('schedule', options.groupName);
      })
      .catch((error: Error) => {
        this.log.error('refreshIndexList Failed', error)
        //refreshIndexList()
      })
    // @ts-ignore
    this._request[ropts.method](ropts, (error: string, response: request.Response) => {
      session.lastEndTs = Date.now()
      this._onContent(error, options, response);

      session.status = SessionStatus.Idle;
      this.e.emit('schedule', options.groupName);
    });
  };

  _onContent(error: any, options: TaskOptions, response: request.Response) {
    if (error) {
      this.log.error(error + ' when fetching ' + (options.uri || options.url) + (options.retries ? ' (' + options.retries + ' retries left)' : ''));

      if (options.retries) {
        this.groups[options.groupName].retries++;
        setTimeout(() => {
          options.retries--;
          this._add2Queue(options.groupName, options);
          this.groups[options.groupName].retries--;
        }, options.retryTimeout);
      } else if (options.error) {
        options.error(error, options);
      }

      return;
    }

    if (!response.body) { response.body = ''; }

    if (response.body.length == 0) {
      this.log.warn('Got ' + (options.uri || 'html') + ' (' + response.body.length + ' bytes)...');
      return options.success(options, response);
    } else {
      this.log.info('Got ' + (options.uri || 'html') + ' (' + response.body.length + ' bytes)...');
    }

    if (options.method === 'HEAD' || !options.jQuery) {
      return options.success(options, response);
    }

    var injectableTypes = ['html', 'xhtml', 'text/xml', 'application/xml', '+xml'];
    if (!options.html && !typeis.is(contentType(response), injectableTypes)) {
      this.log.warn('response body is not HTML, skip injecting. Set jQuery to false to suppress this message');
      return options.success(options, response);
    }

    this._inject(options, response);
  };

  _inject(options: TaskOptions, response: CResponse) {

    let $;
    let defaultCheerioOptions = {
      normalizeWhitespace: false,
      xmlMode: false,
      decodeEntities: true
    };
    let cheerioOptions = options.jQuery.options || defaultCheerioOptions;
    try {
      $ = cheerio.load(response.body, cheerioOptions);
      response.$ = $;
    } catch (e) {
      this.log.error('cheerio.load error', e);
    }

    return options.success(options, response);
  }
}
