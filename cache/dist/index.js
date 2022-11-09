"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataCache = void 0;
var scheduleTime = 600 * 1000;
var DataCache = /** @class */ (function () {
    function DataCache(config) {
        var _this = this;
        //数据获取后，先缓存，再依次回调
        this._retrieved = function (key, value, ttl) {
            if (value != null && ttl > 0) {
                _this.data[key] = { t: Date.now() + ttl * 1000, v: value, l: Date.now() };
            }
            if (_this.queue[key] == undefined) {
                return;
            }
            while (_this.queue[key].length > 0) {
                var callback = _this.queue[key].shift();
                callback(value);
            }
            delete _this.queue[key];
        };
        //检查数据，删除老数据
        this._checkData = function () {
            var cnt = 0;
            var now = Date.now();
            for (var key in _this.data) {
                if (_this.data[key].t < now && _this.data[key].l + 1000 * 3600 * 24 < now) {
                    //过期并且一天都没用到过，删除
                    delete _this.data[key];
                    cnt++;
                }
            }
            console.log("_checkData,".concat(new Date().toLocaleString("en-US"), ",del:").concat(cnt));
            setTimeout(_this._checkData, _this.checkInterval);
        };
        this.config = config;
        if (config.checkInterval != undefined) {
            this.checkInterval = config.checkInterval;
        }
        else {
            this.checkInterval = scheduleTime;
        }
        this.data = {};
        this.queue = {};
        if (this.checkInterval > 0) {
            setTimeout(this._checkData, this.checkInterval);
        }
    }
    DataCache.prototype.get = function (key, retrieve, callback) {
        if (this.data[key] != undefined && this.data[key].t > Date.now()) {
            //有数据，并且没有过期
            this.data[key].l = Date.now();
            callback(this.data[key].v);
        }
        else if (this.queue[key] == undefined) {
            this.queue[key] = [callback];
            retrieve(this._retrieved);
        }
        else {
            //队列不为空，只加入
            this.queue[key].push(callback);
            retrieve(this._retrieved);
        }
    };
    //强制重新获取
    DataCache.prototype.getNocache = function (key, retrieve, callback) {
        if (this.queue[key] == undefined) {
            this.queue[key] = [callback];
        }
        else {
            //队列不为空
            this.queue[key].push(callback);
        }
        retrieve(this._retrieved);
    };
    return DataCache;
}());
exports.DataCache = DataCache;
