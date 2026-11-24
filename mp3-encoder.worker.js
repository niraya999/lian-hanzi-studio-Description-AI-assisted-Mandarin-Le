/* Local LGPL-3.0 encoder bundle; see vendor/audio/LAMEJS-LICENSE.txt. */
importScripts('./vendor/audio/lamejs.iife.js');

let encoder;
let chunks = [];
let bitrate = 256;
let channelCount = 2;

self.onmessage = (event) => {
  const message = event.data || {};
  try {
    if (message.type === 'start') {
      bitrate = [128, 192, 256, 320].includes(Number(message.bitrate)) ? Number(message.bitrate) : 256;
      channelCount = message.channels === 1 ? 1 : 2;
      encoder = new lamejs.Mp3Encoder(channelCount, 44100, bitrate);
      chunks = [];
      self.postMessage({ type: 'started', bitrate });
      return;
    }
    if (message.type === 'pcm' && encoder) {
      const channels = message.channels || [];
      const left = toInt16(channels[0]);
      const right = channels.length > 1 ? toInt16(channels[1]) : left;
      const encoded = channelCount === 1 ? encoder.encodeBuffer(left) : encoder.encodeBuffer(left, right);
      if (encoded?.length) chunks.push(new Uint8Array(encoded));
      return;
    }
    if (message.type === 'finish' && encoder) {
      const tail = encoder.flush();
      if (tail?.length) chunks.push(new Uint8Array(tail));
      const blob = new Blob(chunks, { type: 'audio/mpeg' });
      encoder = undefined;
      chunks = [];
      self.postMessage({ type: 'done', blob, bitrate });
      return;
    }
    if (message.type === 'cancel') {
      encoder = undefined;
      chunks = [];
    }
  } catch (error) {
    encoder = undefined;
    chunks = [];
    self.postMessage({ type: 'error', message: error?.message || 'MP3 encoder failed.' });
  }
};

function toInt16(input) {
  if (!input) return new Int16Array(0);
  const result = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const value = Math.max(-1, Math.min(1, input[i]));
    result[i] = value < 0 ? value * 32768 : value * 32767;
  }
  return result;
}
