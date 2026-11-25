from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'index.html').read_text(encoding='utf-8')
SW = (ROOT / 'sw.js').read_text(encoding='utf-8')
ENGINE = (ROOT / 'audio-recording-engine.mjs').read_text(encoding='utf-8')
UI = (ROOT / 'audio-recording-ui.js').read_text(encoding='utf-8')
WORKER = (ROOT / 'mp3-encoder.worker.js').read_text(encoding='utf-8')


class AudioRecordingIntegration(unittest.TestCase):
    def test_recording_settings_and_player_controls_exist(self):
        for element in ('enableAudioRecording', 'rememberRecordingConsent', 'reuseAudioCapture', 'recordingAutoStop', 'recordingBitrate', 'disconnectAudioCapture', 'startAudioRecording', 'stopAudioRecording', 'cancelAudioRecording'):
            self.assertIn(f'id="{element}"', HTML)
        self.assertIn('MP3 Ready', UI)
        self.assertIn('Encoding MP3...', UI)
        self.assertIn('Recording Failed', UI)

    def test_uses_existing_cache_and_keeps_recordings_out_of_suno_source_validation(self):
        self.assertIn("indexedDB.open('lhs-mp3-cache-v1',1)", HTML)
        self.assertEqual(HTML.count("indexedDB.open('lhs-mp3-cache-v1',1)"), 1)
        self.assertIn('putRecording(recording)', HTML)
        self.assertIn("sourceType==='recording'", HTML)
        self.assertIn("sourceType!=='recording'", HTML)
        self.assertIn('Pending recordings were preserved', HTML)

    def test_recording_is_native_authorized_audio_only(self):
        self.assertIn("['authorized-native-audio', 'imported-local-audio']", ENGINE)
        self.assertIn("(audio.currentSrc || audio.src || '').startsWith('blob:')", ENGINE)
        self.assertNotIn('getUserMedia', ENGINE)
        self.assertIn('Suno embeds and restricted sources are not supported', ENGINE)

    def test_worker_encodes_locally_and_precache_is_versioned(self):
        self.assertIn("importScripts('./vendor/audio/lamejs.iife.js')", WORKER)
        self.assertIn('new lamejs.Mp3Encoder(channelCount, 44100, bitrate)', WORKER)
        for path in ('./audio-recording-ui.js?v=1', './audio-recording-engine.mjs', './audio-capture.worklet.js', './mp3-encoder.worker.js', './vendor/audio/lamejs.iife.js'):
            self.assertIn(path, SW)
        self.assertIn("lhs-shell-v126", SW)
        self.assertIn('v0.8.5-beta', HTML)

    def test_sync_is_manual_and_never_overwrites_a_drive_mp3(self):
        self.assertIn('Sync All Ready MP3', HTML)
        self.assertIn("if(chooseAudio(await list(id)))throw Error('A MP3 already exists", HTML)
        self.assertIn('Uploaded song.mp3 could not be verified', HTML)
        self.assertIn('removeKey(cacheKey)', HTML)


if __name__ == '__main__':
    unittest.main()
