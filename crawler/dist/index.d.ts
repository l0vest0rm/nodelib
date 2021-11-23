/// <reference types="node" />
import * as events from 'events';
import { Method, AxiosRequestConfig, AxiosResponse } from 'axios';
import * as log4js from 'log4js';
interface AnyMap {
    [propName: string]: any;
}
interface GroupOptions {
    groupVars?: AnyMap;
    jQuery?: boolean;
    method?: Method;
    priority?: number;
    waitBefore?: number;
    referer?: boolean | string;
    retries?: number;
    retryTimeout?: number;
    timeout?: number;
}
interface SessionOptions extends AxiosRequestConfig {
    waitBefore?: number;
    sessionVars?: AnyMap;
}
interface Session {
    sessionName: string;
    options: SessionOptions;
}
export interface Group {
    groupName: string;
    options: GroupOptions;
    sessions: Session[];
    tasks: TaskOptions[];
}
export interface CResponse extends AxiosResponse {
    charset?: string;
    $?: any;
}
export declare type TaskOptions = AxiosRequestConfig & AnyMap;
export interface CrawlerOptions {
    runForever?: boolean;
    log?: log4js.Logger;
}
export declare class Crawler {
    private e;
    private options;
    private groups;
    private comparator;
    private log;
    constructor(e: events.EventEmitter, options: CrawlerOptions);
    private _onSchedule;
    private _onGroup;
    private _onSession;
    private _onAdd;
    private _onClear;
    private _add2Queue;
    private _doTask;
    private _doRequest;
    private _onContent;
    private _inject;
}
export {};
