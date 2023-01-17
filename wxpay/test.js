import * as fs from 'fs'
import * as wxpay from './dist/index.js'

async function test() {
  const appid = 'wx4029e718ae2e717e'
  const mchid = '1636288145'
  const serial_no = '321C38372168650D76426CB2B7D201D2041C3279'
  const pay = new wxpay.Pay(appid,
    mchid,
    fs.readFileSync('data/1636288145/apiclient_cert.pem'),
    fs.readFileSync('data/1636288145/apiclient_key.pem'),
    serial_no)

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

test()