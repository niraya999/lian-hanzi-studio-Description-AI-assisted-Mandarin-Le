import pathlib,unittest
page=(pathlib.Path(__file__).resolve().parents[1]/'index.html').read_text(encoding='utf-8')
class NativePriority(unittest.TestCase):
 def test_mp3_is_preferred_even_with_suno_link(self):
  self.assertIn("if(!audio){window.loadSuno(url)",page)
  self.assertIn("window.setupNativeTrack?.(audio?async()=>",page)
  self.assertIn("else{el('sunoOpen').href=url;el('sunoOpen').hidden=false;}",page)
 def test_slideshow_immediately_precedes_audio(self):
  start=page.index('id="playerSlideshow"')
  audio=page.index('id="nativeAudioPanel"')
  suno=page.index('id="sunoFrame"')
  extras=page.index('id="sunoExtras"')
  self.assertTrue(start<audio<suno<extras)
 def test_auto_next_stays_enabled(self):
  self.assertIn("audio.addEventListener('ended'",page)
  self.assertIn('id="autoNextEnabled"',page)
if __name__=='__main__':unittest.main()
