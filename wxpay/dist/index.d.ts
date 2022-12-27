/// <reference types="node" resolution-mode="require"/>
interface Iamount {
    total: number;
    currency?: string;
}
interface Idetail {
    cost_price?: number;
    invoice_id?: string;
    goods_detail?: IgoodsDetail[];
}
interface IgoodsDetail {
    merchant_goods_id: string;
    wechatpay_goods_id?: string;
    goods_name?: string;
    quantity: number;
    unit_price: number;
}
interface IsceneInfoNative {
    payer_client_ip: string;
    device_id?: string;
    store_info?: IstoreInfo;
}
interface IstoreInfo {
    id: string;
    name?: string;
    area_code?: string;
    address?: string;
}
export interface Inative {
    description: string;
    out_trade_no: string;
    time_expire?: string;
    attach?: string;
    notify_url: string;
    goods_tag?: string;
    amount: Iamount;
    detail?: Idetail;
    scene_info?: IsceneInfoNative;
}
export declare class Pay {
    private appid;
    private mchid;
    private serial_no;
    private publicKey?;
    private privateKey?;
    private authType;
    /**
     * 构造器
     * @param appid 直连商户申请的公众号或移动应用appid。
     * @param mchid 商户号
     * @param publicKey 公钥
     * @param privateKey 密钥
     * @param optipns 可选参数 object 包括下面参数
     *
     * @param serial_no  证书序列号
     * @param authType 可选参数 认证类型，目前为WECHATPAY2-SHA256-RSA2048
     * @param userAgent 可选参数 User-Agent
     * @param key 可选参数 APIv3密钥
     */
    constructor(appid: string, mchid: string, publicKey: Buffer, privateKey: Buffer, serial_no: string);
    /**
     * 参数初始化
     */
    private init;
    /**
     * 构建请求签名参数
     * @param method Http 请求方式
     * @param url 请求接口 例如/v3/certificates
     * @param timestamp 获取发起请求时的系统当前时间戳
     * @param nonceStr 随机字符串
     * @param body 请求报文主体
     */
    getSignature(method: string, nonce_str: string, timestamp: string, url: string, body?: string | Record<string, any>): string;
    /**
     * SHA256withRSA
     * @param data 待加密字符
     * @param privatekey 私钥key  key.pem   fs.readFileSync(keyPath)
     */
    sha256WithRsa(data: string): string;
    /**
     * 获取授权认证信息
     * @param nonceStr  请求随机串
     * @param timestamp 时间戳
     * @param signature 签名值
     */
    getAuthorization(nonce_str: string, timestamp: string, signature: string): string;
    /**
     * native支付
     * @param params 请求参数 object 参数介绍 请看文档https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_4_1.shtml
     */
    transactions_native(params: Inative): Promise<Record<string, any>>;
    /**
     * post 请求
     * @param url  请求接口
     * @param params 请求参数
     */
    private postRequest;
}
export {};
