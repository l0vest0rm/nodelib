const scheduleTime = 600 * 1000

interface Data {
  //上次访问时间戳
  l: number
  //过期时间戳
  t: number
  //数据
  v: any
}

export type Retrieved = (key: string, value: any, ttl: number) => void

export class DataCache {
  config: any
  checkInterval: number
  data: { [key: string]: Data }
  queue: { [key: string]: any[] }
  constructor(config: any) {
    this.config = config
    if (config.checkInterval) {
      this.checkInterval = config.checkInterval
    } else {
      this.checkInterval = scheduleTime
    }
    this.data = {}
    this.queue = {}
    if (this.checkInterval > 0) {
      setTimeout(this._checkData, this.checkInterval)
    }
  }

  get(key: string, retrieve: (retrieved: Retrieved) => void, callback: (value: any) => void) {
    if (this.data[key] && this.data[key].t > Date.now()) {
      //有数据，并且没有过期
      this.data[key].l = Date.now()
      callback(this.data[key].v)
    } else if (!this.queue[key]) {
      this.queue[key] = [callback]
      retrieve(this._retrieved)
    } else {
      //队列不为空，只加入
      this.queue[key].push(callback)
      retrieve(this._retrieved)
    }
  }

  //强制重新获取
  getNocache(key: string, retrieve: (retrieved: Retrieved) => void, callback: (value: any) => void) {
    if (!this.queue[key]) {
      this.queue[key] = [callback]
    } else {
      //队列不为空
      this.queue[key].push(callback)
    }
    retrieve(this._retrieved)
  }

  //数据获取后，先缓存，再依次回调
  _retrieved = (key: string, value: any, ttl: number) => {
    if (value != null && ttl > 0) {
      this.data[key] = { t: Date.now() + ttl * 1000, v: value, l: Date.now() }
    }

    if (!this.queue[key]) {
      return
    }

    while (this.queue[key].length > 0) {
      let callback = this.queue[key].shift()
      callback(value)
    }
    delete this.queue[key]
  }

  //检查数据，删除老数据
  _checkData = () => {
    let cnt = 0
    let now = Date.now()
    for (let key in this.data) {
      if (this.data[key].t < now && this.data[key].l + 1000 * 3600 * 24 < now) {
        //过期并且一天都没用到过，删除
        delete this.data[key]
        cnt++
      }
    }

    console.log(`_checkData,${new Date().toLocaleString("en-US")},del:${cnt}`)
    setTimeout(this._checkData, this.checkInterval)
  }
}