import pathlib,unittest
PAGE=(pathlib.Path(__file__).resolve().parents[1]/'index.html').read_text(encoding='utf-8')
class AutoNextTests(unittest.TestCase):
 def test_native_player_and_toggle(self):
  for s in ['id="nativeTrackAudio"','id="autoNextEnabled"','id="nextTrackButton"','id="playlistPosition"']:
   self.assertIn(s,PAGE)
 def test_next_only_when_audio_ended(self):
  self.assertIn("audio.addEventListener('ended'",PAGE)
  self.assertIn("if(el('autoNextEnabled').checked)next()",PAGE)
  self.assertIn("i+1>=q.length",PAGE)
 def test_queue_is_album_scoped(self):
  self.assertIn("window.lhsAlbumQueue=a.filter(f=>f.mimeType===folder)",PAGE)
  self.assertIn("window.lhsCurrentTrackId=id",PAGE)
  self.assertIn("window.lhsOpenTrack?.(item.id,item.name)",PAGE)
 def test_no_double_audio_and_cleanup(self):
  self.assertIn("if(!audio)window.loadSuno(url)",PAGE)
  self.assertIn("window.resetNativeTrack?.()",PAGE)
  self.assertIn("URL.revokeObjectURL(objectUrl)",PAGE)
  self.assertIn("if(sunoUrl&&valid())window.loadSuno?.(sunoUrl)",PAGE)
if __name__=='__main__':unittest.main()
