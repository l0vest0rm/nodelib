"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Crawler = void 0;
const axios_1 = require("axios");
const log4js = require("log4js");
const cheerio = require("cheerio");
const pq = require("priority-queue");
// 模拟浏览器信息
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36";
axios_1.default.defaults.timeout = 5000;
axios_1.default.defaults.headers.common = {
    'User-Agent': UA,
    //cookie: Cookie,
    //referer: 'https://ark-funds.com/arkk',
    //accept: 'application/json, text/javascript, */*; q=0.01',
    //'accept-encoding': 'gzip, deflate, br',
    //'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,cy;q=0.6,zh-TW;q=0.5,mt;q=0.4,fr;q=0.3,ja;q=0.2,hu;q=0.1,pl;q=0.1,pt;q=0.1',
    //'sec-fetch-mode': 'cors',
    //'sec-fetch-site': 'same-origin',
};
var SessionStatus;
(function (SessionStatus) {
    SessionStatus[SessionStatus["Idle"] = 1] = "Idle";
    SessionStatus[SessionStatus["Running"] = 2] = "Running";
    SessionStatus[SessionStatus["Sleeping"] = 3] = "Sleeping";
})(SessionStatus || (SessionStatus = {}));
class Crawler {
    constructor(e, options) {
        let defaultOptions = {
            runForever: true
        };
        this.e = e;
        // default is the default kind options and also the global options
        this.options = options ? { ...defaultOptions, ...options } : defaultOptions;
        if (this.options.log) {
            this.log = this.options.log;
            delete this.options['log'];
        }
        else {
            this.log = log4js.getLogger('crawler');
            this.log.level = 'info';
        }
        this.comparator = function (a, b) {
            return a.priority < b.priority;
        };
        this.groups = {};
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
        this.e.on('schedule', (groupName) => {
            let group = this.groups[groupName];
            if (group.queue.isEmpty()) {
                if (group.retries == 0) {
                    //drain
                    this.e.emit('drain' + groupName);
                }
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
                    options = { ...session.options, ...options };
                    this._doTask(options);
                }, timeout);
                return;
            }
        });
    }
    _onGroup() {
        this.e.on('group', (groupName, options) => {
            let defaultOptions = {
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
                };
            }
            this.groups[groupName].options = options ? { ...defaultOptions, ...options } : defaultOptions;
        });
    }
    //session不继承instance参数
    _onSession() {
        this.e.on('session', (groupName, sessionName, options) => {
            if (this.groups[groupName].sessions[sessionName]) {
                this.groups[groupName].sessions[sessionName].options = options;
            }
            else {
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
        this.e.on('add', (groupName, options) => {
            if (!this.groups[groupName]) {
                this.log.error('please check the groupName of options', groupName);
                return;
            }
            this._add2Queue(groupName, options);
            return;
        });
    }
    _onClear() {
        this.e.on('clear', (groupName) => {
            //clear queue
            let queue = this.groups[groupName].queue;
            while (!queue.isEmpty)
                queue.pop();
        });
    }
    _add2Queue(groupName, options) {
        options = { ...this.groups[groupName].options, ...options };
        options.groupName = groupName;
        this.groups[groupName].queue.push(options);
        //this.log('_add2Queue', JSON.stringify(options));
        this.e.emit('schedule', groupName);
    }
    _doTask(options) {
        if (!options.headers) {
            options.headers = {};
        }
        if (options.forceUTF8) {
            options.encoding = null;
        }
        // specifying json in request will have request sets body to JSON representation of value and 
        // adds Content-type: application/json header. Additionally, parses the response body as JSON
        // so the response will be JSON object, no need to deal with encoding
        if (options.json) {
            options.encoding = null;
        }
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
            .then((cancel) => {
            if (cancel)
                return;
            this._doRequest(options);
        }).catch((error) => {
            this.log.error("preRequest Catch Error:", error);
        });
    }
    ;
    _doRequest(options) {
        if (options.skipEventRequest !== true) {
            this.e.emit('request', options);
        }
        var requestArgs = ['url', 'method', 'headers', 'params', 'data', 'timeout', 'withCredentials', 'auth', 'responseType', 'responseEncoding', 'xsrfCookieName', 'maxRedirects', 'httpAgent', 'httpsAgent', 'proxy', 'decompress'];
        //let opts: request.UriOptions & Options = { uri: ropts.uri };
        let ropts = { url: options.url };
        for (let opt of requestArgs) {
            // @ts-ignore
            ropts[opt] = options[opt];
        }
        let session = this.groups[options.groupName].sessions[options.sessionName];
        session.lastStartTs = Date.now();
        session.lastEndTs = 0;
        (0, axios_1.default)(ropts)
            .then((res) => {
            session.lastEndTs = Date.now();
            if (options.params) {
                this.log.debug(options.method, options.url, options.headers, JSON.stringify(options.params), res);
            }
            else {
                this.log.debug(options.method, options.url, options.headers, res);
            }
            this._onContent(options, res);
        })
            .catch((error) => {
            if (!session.lastEndTs) {
                session.lastEndTs = Date.now();
            }
            this.log.error(error + JSON.stringify(options.params) + ' when fetching ' + options.url + (options.retries ? ' (' + options.retries + ' retries left)' : ''));
            if (options.retries) {
                this.groups[options.groupName].retries++;
                setTimeout(() => {
                    options.retries--;
                    this._add2Queue(options.groupName, options);
                    this.groups[options.groupName].retries--;
                }, options.retryTimeout);
            }
            else if (options.error) {
                options.error(error, options);
            }
        }).finally(() => {
            session.status = SessionStatus.Idle;
            this.e.emit('schedule', options.groupName);
        });
    }
    ;
    _onContent(options, res) {
        if (!res.data) {
            res.data = '';
        }
        if (options.method === 'HEAD' || !options.jQuery) {
            return options.success(options, res);
        }
        var injectableTypes = ['html', 'xhtml', 'text/xml', 'application/xml', '+xml'];
        if (!options.html && !injectableTypes.includes(res.headers['content-type'].split(';')[0].trim())) {
            this.log.warn('response body is not HTML, skip injecting. Set jQuery to false to suppress this message', res.headers['content-type']);
            return options.success(options, res);
        }
        this._inject(options, res);
    }
    ;
    _inject(options, res) {
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
        }
        catch (e) {
            this.log.error('cheerio.load error', e);
        }
        return options.success(options, res);
    }
}
exports.Crawler = Crawler;
