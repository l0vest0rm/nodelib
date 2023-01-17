import * as fs from 'fs'
import * as wxpay from './dist/index.js'

function initWxpay() {
  const appid = 'wx4029e718ae2e717e'
  const mchid = '1636288145'
  const apiv3Key = 'cgyu9iuh5tgb9iuhbrd8uh4rdc8ujh7y'
  const serial_no = '321C38372168650D76426CB2B7D201D2041C3279'
  return new wxpay.Pay(appid,
    mchid,
    apiv3Key,
    fs.readFileSync('data/1636288145/apiclient_cert.pem'),
    fs.readFileSync('data/1636288145/apiclient_key.pem'),
    serial_no)
}

async function test() {
  const pay = initWxpay()

  let params = {
    description: '测试',
    out_trade_no: Date.now() + '',
    notify_url: 'https://study6.vip/api/callback',
    amount: {
      total: 1,
    },
    scene_info: {
      payer_client_ip: 'ip',
    },
  };

  //params = { out_trade_no: '1609914303237' }
  pay.transactions_native(params).then(res => {
    console.log(res)
  }).catch(e => {
    console.log(e)
  })
}

async function testDecodeNotify() {
  const pay = initWxpay()

  let notify = `{
    id: 'bdade405-f597-5dc9-9275-cce22a4e96de',
    create_time: '2023-01-17T14:46:44+08:00',
    resource_type: 'encrypt-resource',
    event_type: 'TRANSACTION.SUCCESS',
    summary: '支付成功',
    resource: {
      original_type: 'transaction',
      algorithm: 'AEAD_AES_256_GCM',
      ciphertext: 'sxJOaElX1fsf97cMh/h7QI0V+zgjRL8ZYMTuleVGayl4rzM+dyd810Sdr8Ph7iSwIvsTeJiC61I1T2b0UxEEqObMuXRcpcveoWgB9AgXKvRhMbVvkyX8OA+DHajF5t+39QAVMIGvBirxi/ni7pjUSBxPvdLANC+0jc/z7//GDyfdMMaiKWUGhEIeX5lxuyS9+6GX01zpHx6ldLcW5JviZwCw629+kyM1VMAkAKfE+kBSm2DJgdIQBPG6zFNARgrrVHhnn6JCxMSngWLs88ZAcAdoeHSSGB2UExP7/aCoNAus1oMNRI9hSXMK4BduRYWObB4EPTM0dR4UXXURl2ySgwOXMWhorkMi4olsJ5y9Y6rbn3ClyZ/BLMONZrg3examGGIdFZ1voLbDeBy3nGHJudXm9eEC6GJ0TzBfHIBRf7f7O6523rF4yL+uaOHbidVBoQkJ+gmsfibFzOLJZ+sEvjeoAydFp5OzXEldZto/kvYZOhzznRpROPPO2hGoGidOvAwHA4B4FClDMtKFXSaVa8qlJppXy6Ml2y2hbAm8RYlZgIJolx10VLNs6x2IItaG',
      associated_data: 'transaction',
      nonce: '4mkfasulxeVM'
    }
  }`

  /*`{
  mchid: '1636288145',
  appid: 'wx4029e718ae2e717e',
  out_trade_no: '1673937989904',
  transaction_id: '4200001714202301173708441034',
  trade_type: 'NATIVE',
  trade_state: 'SUCCESS',
  trade_state_desc: '支付成功',
  bank_type: 'PAB_DEBIT',
  attach: '',
  success_time: '2023-01-17T14:46:44+08:00',
  payer: { openid: 'oTshg6SxUv-AOCi_dn_vS21RvYOk' },
  amount: { total: 1, payer_total: 1, currency: 'CNY', payer_currency: 'CNY' }
}`*/

  let json = eval(`(${notify})`)
  let decode = pay.decipher_gcm(json.resource.ciphertext, json.resource.associated_data, json.resource.nonce);
  let ts = (new Date(decode.success_time)).getTime()
  console.log(ts)
}

testDecodeNotify()