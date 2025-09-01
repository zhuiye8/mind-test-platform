// AudioWorklet处理器 - 替代废弃的ScriptProcessor
// 用于实时音频数据采集和处理

class AudioStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.sampleRate = 44100;
    this.isActive = true;
    
    // 监听主线程消息
    this.port.onmessage = (event) => {
      if (event.data.type === 'configure') {
        this.sampleRate = event.data.sampleRate || 44100;
        this.bufferSize = event.data.bufferSize || 4096;
      } else if (event.data.type === 'stop') {
        this.isActive = false;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    // 如果没有输入或已停止，直接返回
    if (!this.isActive || !input || input.length === 0) {
      return this.isActive;
    }

    const inputData = input[0]; // 获取第一个声道的数据
    
    if (inputData && inputData.length > 0) {
      // 创建副本避免引用问题
      const audioData = new Float32Array(inputData);
      
      // 发送音频数据到主线程
      this.port.postMessage({
        type: 'audioData',
        data: audioData,
        sampleRate: this.sampleRate,
        timestamp: currentTime
      });
    }

    return this.isActive;
  }
}

// 注册AudioWorklet处理器
registerProcessor('audio-stream-processor', AudioStreamProcessor);