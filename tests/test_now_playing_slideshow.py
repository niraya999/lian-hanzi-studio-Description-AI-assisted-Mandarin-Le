import pathlib,unittest
page=(pathlib.Path(__file__).resolve().parents[1]/'index.html').read_text(encoding='utf-8')
class NowPlayingSlideshowTests(unittest.TestCase):
 def test_controls(self):
  for token in ['id="playerSlideshow"','id="playerSlideImage"','id="slidePrev"','id="slideNext"','id="slidePause"','id="slidePosition"']:
   self.assertIn(token,page)
 def test_drive_images_and_reset(self):
  self.assertIn('window.setPlayerSlides?.(arts.map(loadArt))',page)
  self.assertIn('window.resetPlayerSlides?.()',page)
  self.assertIn('URL.revokeObjectURL(url)',page)
 def test_no_audio_interference(self):
  self.assertIn('setInterval(()=>show(index+1),5000)',page)
  self.assertIn('prefers-reduced-motion: reduce',page)
  self.assertIn('touchend',page)
  self.assertIn('document.addEventListener(\'visibilitychange\',schedule)',page)
if __name__=='__main__':unittest.main()
