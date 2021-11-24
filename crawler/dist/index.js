"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Crawler = void 0;
var axios_1 = require("axios");
var log4js = require("log4js");
var cheerio = require("cheerio");
var pq = require("priority-queue");
// 模拟浏览器信息
var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36";
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
var Crawler = /** @class */ (function () {
    function Crawler(e, options) {
        var _this = this;
        var defaultOptions = {
            runForever: true
        };
        this.e = e;
        // default is the default kind options and also the global options
        this.options = options ? __assign(__assign({}, defaultOptions), options) : defaultOptions;
        if (this.options.log) {
            this.log = this.options.log;
            delete this.options['log'];
        }
        else {
            this.log = log4js.getLogger('crawler');
            this.log.level = 'debug';
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
            setInterval(function () {
                var used = process.memoryUsage().heapUsed / 1024 / 1024;
                _this.log.info("The script uses approximately ".concat(Math.round(used * 100) / 100, " MB"));
            }, 600000);
        }
    }
    Crawler.prototype._onSchedule = function () {
        var _this = this;
        this.e.on('schedule', function (groupName) {
            var group = _this.groups[groupName];
            if (group.queue.isEmpty()) {
                if (group.retries == 0) {
                    //drain
                    _this.e.emit('drain' + groupName);
                }
                return;
            }
            var _loop_1 = function (sessionName) {
                if (group.sessions[sessionName].status != SessionStatus.Idle) {
                    return "continue";
                }
                var session = group.sessions[sessionName];
                session.status = SessionStatus.Sleeping;
                var options = group.queue.pop();
                options.sessionName = sessionName;
                var timeout = options.waitBefore;
                setTimeout(function () {
                    session.status = SessionStatus.Running;
                    options = __assign(__assign({}, session.options), options);
                    _this._doTask(options);
                }, timeout);
                return { value: void 0 };
            };
            for (var sessionName in group.sessions) {
                var state_1 = _loop_1(sessionName);
                if (typeof state_1 === "object")
                    return state_1.value;
            }
        });
    };
    Crawler.prototype._onGroup = function () {
        var _this = this;
        this.e.on('group', function (groupName, options) {
            var defaultOptions = {
                jQuery: false,
                method: 'get',
                priority: 100,
                waitBefore: 1,
                referer: false,
                retries: 1,
                retryTimeout: 100,
                timeout: 5000
            };
            if (!_this.groups[groupName]) {
                _this.groups[groupName] = {
                    queue: new pq.PriorityQueue(),
                    options: defaultOptions,
                    sessions: {},
                    retries: 0
                };
            }
            _this.groups[groupName].options = options ? __assign(__assign({}, defaultOptions), options) : defaultOptions;
        });
    };
    //session不继承instance参数
    Crawler.prototype._onSession = function () {
        var _this = this;
        this.e.on('session', function (groupName, sessionName, options) {
            if (_this.groups[groupName].sessions[sessionName]) {
                _this.groups[groupName].sessions[sessionName].options = options;
            }
            else {
                _this.groups[groupName].sessions[sessionName] = {
                    options: options,
                    status: SessionStatus.Idle,
                    lastStartTs: 0,
                    lastEndTs: 0
                };
            }
        });
    };
    Crawler.prototype._onAdd = function () {
        var _this = this;
        this.e.on('add', function (groupName, options) {
            if (!_this.groups[groupName]) {
                _this.log.error('please check the groupName of options', groupName);
                return;
            }
            _this._add2Queue(groupName, options);
            return;
        });
    };
    Crawler.prototype._onClear = function () {
        var _this = this;
        this.e.on('clear', function (groupName) {
            //clear queue
            var queue = _this.groups[groupName].queue;
            while (!queue.isEmpty)
                queue.pop();
        });
    };
    Crawler.prototype._add2Queue = function (groupName, options) {
        options = __assign(__assign({}, this.groups[groupName].options), options);
        options.groupName = groupName;
        this.groups[groupName].queue.push(options);
        //this.log('_add2Queue', JSON.stringify(options));
        this.e.emit('schedule', groupName);
    };
    Crawler.prototype._doTask = function (options) {
        var _this = this;
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
            .then(function (cancel) {
            if (cancel)
                return;
            _this._doRequest(options);
        }).catch(function (error) {
            _this.log.error("preRequest Catch Error:", error);
        });
    };
    ;
    Crawler.prototype._doRequest = function (options) {
        var _this = this;
        if (options.skipEventRequest !== true) {
            this.e.emit('request', options);
        }
        var requestArgs = ['url', 'method', 'headers', 'params', 'data', 'timeout', 'withCredentials', 'auth', 'responseType', 'responseEncoding', 'xsrfCookieName', 'maxRedirects', 'httpAgent', 'httpsAgent', 'proxy', 'decompress'];
        //let opts: request.UriOptions & Options = { uri: ropts.uri };
        var ropts = { url: options.url };
        for (var _i = 0, requestArgs_1 = requestArgs; _i < requestArgs_1.length; _i++) {
            var opt = requestArgs_1[_i];
            // @ts-ignore
            ropts[opt] = options[opt];
        }
        var session = this.groups[options.groupName].sessions[options.sessionName];
        session.lastStartTs = Date.now();
        session.lastEndTs = 0;
        (0, axios_1.default)(ropts)
            .then(function (res) {
            session.lastEndTs = Date.now();
            /*if (options.params) {
              this.log.info(options.method, options.url, JSON.stringify(options.params))
            } else {
              this.log.info(options.method, options.url)
            }*/
            _this._onContent(options, res);
        })
            .catch(function (error) {
            if (!session.lastEndTs) {
                session.lastEndTs = Date.now();
            }
            _this.log.error(error + ' when fetching ' + options.url + (options.retries ? ' (' + options.retries + ' retries left)' : ''));
            if (options.retries) {
                _this.groups[options.groupName].retries++;
                setTimeout(function () {
                    options.retries--;
                    _this._add2Queue(options.groupName, options);
                    _this.groups[options.groupName].retries--;
                }, options.retryTimeout);
            }
            else if (options.error) {
                options.error(error, options);
            }
        }).finally(function () {
            session.status = SessionStatus.Idle;
            _this.e.emit('schedule', options.groupName);
        });
    };
    ;
    Crawler.prototype._onContent = function (options, res) {
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
    };
    ;
    Crawler.prototype._inject = function (options, res) {
        var $;
        var defaultCheerioOptions = {
            normalizeWhitespace: false,
            xmlMode: false,
            decodeEntities: true
        };
        var cheerioOptions = options.jQuery.options || defaultCheerioOptions;
        try {
            $ = cheerio.load(res.data, cheerioOptions);
            res.$ = $;
        }
        catch (e) {
            this.log.error('cheerio.load error', e);
        }
        return options.success(options, res);
    };
    return Crawler;
}());
exports.Crawler = Crawler;
