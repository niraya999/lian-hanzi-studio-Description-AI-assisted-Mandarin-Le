import pathlib, unittest
page=(pathlib.Path(__file__).resolve().parents[1]/'index.html').read_text(encoding='utf-8')
class SunoPlayerRegression(unittest.TestCase):
 def test_suno_link_always_loads_even_when_mp3_exists(self):
  self.assertIn("if(!audio){window.loadSuno(url)",page)
  self.assertNotIn("if(url){el('sunoUrl').value=url;window.loadSuno(url);}",page)
 def test_native_only_when_suno_link_absent(self):
  self.assertIn("window.setupNativeTrack?.(audio?async()=>",page)
 def test_next_track_still_available_for_native_audio(self):
  self.assertIn("audio.addEventListener('ended'",page)
if __name__=='__main__':unittest.main()
