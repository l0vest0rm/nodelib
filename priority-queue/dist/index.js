"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var top = 0;
var parent = function (i) { return ((i + 1) >>> 1) - 1; };
var left = function (i) { return (i << 1) + 1; };
var right = function (i) { return (i + 1) << 1; };
var PriorityQueue = /** @class */ (function () {
    function PriorityQueue(comparator) {
        if (comparator === void 0) { comparator = function (a, b) { return a > b; }; }
        this._heap = [];
        this._comparator = comparator;
    }
    PriorityQueue.prototype.size = function () {
        return this._heap.length;
    };
    PriorityQueue.prototype.isEmpty = function () {
        return this.size() == 0;
    };
    PriorityQueue.prototype.peek = function () {
        return this._heap[top];
    };
    PriorityQueue.prototype.push = function () {
        var _this = this;
        var values = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            values[_i] = arguments[_i];
        }
        values.forEach(function (value) {
            _this._heap.push(value);
            _this._siftUp();
        });
        return this.size();
    };
    PriorityQueue.prototype.pop = function () {
        var poppedValue = this.peek();
        var bottom = this.size() - 1;
        if (bottom > top) {
            this._swap(top, bottom);
        }
        this._heap.pop();
        this._siftDown();
        return poppedValue;
    };
    PriorityQueue.prototype.replace = function (value) {
        var replacedValue = this.peek();
        this._heap[top] = value;
        this._siftDown();
        return replacedValue;
    };
    PriorityQueue.prototype._greater = function (i, j) {
        return this._comparator(this._heap[i], this._heap[j]);
    };
    PriorityQueue.prototype._swap = function (i, j) {
        var _a;
        _a = [this._heap[j], this._heap[i]], this._heap[i] = _a[0], this._heap[j] = _a[1];
    };
    PriorityQueue.prototype._siftUp = function () {
        var node = this.size() - 1;
        while (node > top && this._greater(node, parent(node))) {
            this._swap(node, parent(node));
            node = parent(node);
        }
    };
    PriorityQueue.prototype._siftDown = function () {
        var node = top;
        while ((left(node) < this.size() && this._greater(left(node), node)) ||
            (right(node) < this.size() && this._greater(right(node), node))) {
            var maxChild = (right(node) < this.size() && this._greater(right(node), left(node))) ? right(node) : left(node);
            this._swap(node, maxChild);
            node = maxChild;
        }
    };
    return PriorityQueue;
}());
exports.PriorityQueue = PriorityQueue;
