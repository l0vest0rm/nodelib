import crypto from 'crypto';
import axios from "axios"

// 模拟浏览器信息
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36";
axios.defaults.timeout = 15000
axios.defaults.headers.common = {
  'User-Agent': UA,
  //Cookie: cookie,
  //referer: 'https://ark-funds.com/arkk',
  //accept: 'application/json, text/javascript, */*; q=0.01',
  //'accept-encoding': 'gzip, deflate, br',
  //'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,cy;q=0.6,zh-TW;q=0.5,mt;q=0.4,fr;q=0.3,ja;q=0.2,hu;q=0.1,pl;q=0.1,pt;q=0.1',
  //'sec-fetch-mode': 'cors',
  //'sec-fetch-site': 'same-origin',
}

// 订单金额信息
interface Iamount {
  total: number;
  currency?: string;
}

// 优惠功能
interface Idetail {
  cost_price?: number;
  invoice_id?: string;
  goods_detail?: IgoodsDetail[];
}

// 单品列表信息
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

// 商户门店信息
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

export class Pay {
  private appid: string; //  直连商户申请的公众号或移动应用appid。
  private mchid: string; // 商户号
  private serial_no = ''; // 证书序列号
  private publicKey?: Buffer; // 公钥
  private privateKey?: Buffer; // 密钥
  private authType = 'WECHATPAY2-SHA256-RSA2048'; // 认证类型，目前为WECHATPAY2-SHA256-RSA2048
  private key: string; // APIv3密钥

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
  public constructor(appid: string, mchid: string, key: string, publicKey: Buffer, privateKey: Buffer, serial_no: string) {
    this.appid = appid;
    this.mchid = mchid;
    this.key = key;
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.serial_no = serial_no;
    //if (!this.publicKey) throw new Error('缺少公钥');
    //if (!this.serial_no) this.serial_no = this.getSN(this.publicKey);
  }

  /**
   * 参数初始化
   */
  private init(method: string, url: string, params?: Record<string, any>) {
    const nonce_str = Math.random()
        .toString(36)
        .substring(2, 17),
      timestamp = parseInt(+new Date() / 1000 + '').toString();

    const signature = this.getSignature(method, nonce_str, timestamp, url.replace('https://api.mch.weixin.qq.com', ''), params);
    const authorization = this.getAuthorization(nonce_str, timestamp, signature);
    return authorization;
  }

  /**
   * 构建请求签名参数
   * @param method Http 请求方式
   * @param url 请求接口 例如/v3/certificates
   * @param timestamp 获取发起请求时的系统当前时间戳
   * @param nonceStr 随机字符串
   * @param body 请求报文主体
   */
  public getSignature(method: string, nonce_str: string, timestamp: string, url: string, body?: string | Record<string, any>): string {
    let str = method + '\n' + url + '\n' + timestamp + '\n' + nonce_str + '\n';
    if (body && body instanceof Object) body = JSON.stringify(body);
    if (body) str = str + body + '\n';
    if (method === 'GET') str = str + '\n';
    return this.sha256WithRsa(str);
  }

  /**
   * SHA256withRSA
   * @param data 待加密字符
   * @param privatekey 私钥key  key.pem   fs.readFileSync(keyPath)
   */
  public sha256WithRsa(data: string): string {
    if (!this.privateKey) throw new Error('缺少秘钥文件');
    return crypto
      .createSign('RSA-SHA256')
      .update(data)
      .sign(this.privateKey, 'base64');
  }

  /**
   * 获取授权认证信息
   * @param nonceStr  请求随机串
   * @param timestamp 时间戳
   * @param signature 签名值
   */
  public getAuthorization(nonce_str: string, timestamp: string, signature: string): string {
    const _authorization =
      'mchid="' +
      this.mchid +
      '",' +
      'nonce_str="' +
      nonce_str +
      '",' +
      'timestamp="' +
      timestamp +
      '",' +
      'serial_no="' +
      this.serial_no +
      '",' +
      'signature="' +
      signature +
      '"';
    return this.authType.concat(' ').concat(_authorization);
  }

  /**
   * native支付
   * @param params 请求参数 object 参数介绍 请看文档https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_4_1.shtml
   */
  public async transactions_native(params: Inative): Promise<Record<string, any>> {
    // 请求参数
    const _params = {
      appid: this.appid,
      mchid: this.mchid,
      ...params,
    };
    const url = 'https://api.mch.weixin.qq.com/v3/pay/transactions/native';

    const authorization = this.init('POST', url, _params);

    return await this.postRequest(url, _params, authorization);
  }

  /**
   * post 请求
   * @param url  请求接口
   * @param params 请求参数
   */
   private async postRequest(url: string, params: Record<string, any>, authorization: string): Promise<Record<string, any>> {
    return axios.post(url, params, {
      headers:{
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: authorization,
        'Accept-Encoding': 'gzip',
      }
    })
  }

  /**
   * 回调解密
   * @param ciphertext  Base64编码后的开启/停用结果数据密文
   * @param associated_data 附加数据
   * @param nonce 加密使用的随机串
   * @param key  APIv3密钥
   */
  public decipher_gcm<T extends any>(ciphertext: string, associated_data: string, nonce: string): T {
    const _ciphertext = Buffer.from(ciphertext, 'base64');

    // 解密 ciphertext字符  AEAD_AES_256_GCM算法
    const authTag: any = _ciphertext.slice(_ciphertext.length - 16);
    const data = _ciphertext.slice(0, _ciphertext.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, nonce);
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(associated_data));
    const decoded = decipher.update(data, undefined, 'utf8');
    decipher.final();

    try {
      return JSON.parse(decoded);
    } catch (e) {
      return decoded as T;
    }
  }
}