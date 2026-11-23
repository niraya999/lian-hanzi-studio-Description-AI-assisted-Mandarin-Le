import pathlib,unittest
page=(pathlib.Path(__file__).resolve().parents[1]/'index.html').read_text(encoding='utf-8')
class LayoutTests(unittest.TestCase):
 def test_native_hides_redundant_suno_controls(self):
  self.assertIn('#player.native-playing #sunoForm',page)
  self.assertIn("el('player').classList.add('native-playing')",page)
  self.assertIn("el('player').classList.remove('native-playing')",page)
 def test_responsive_controls(self):
  self.assertIn('@media(max-width:440px)',page)
  self.assertIn('#nativeTrackAudio{display:block',page)
 def test_playback_logic_preserved(self):
  self.assertIn("audio.addEventListener('ended'",page)
  self.assertIn("window.loadSuno=value=>",page)
if __name__=='__main__':unittest.main()
