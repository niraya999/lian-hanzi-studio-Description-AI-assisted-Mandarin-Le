import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
class ResponsiveMusicAndLCFTests(unittest.TestCase):
    def test_music_grid_fills_desktop(self):
        page = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertIn('#library #tracks .track-grid', page)
        self.assertIn('repeat(auto-fill,minmax(min(100%,170px),1fr))', page)
        self.assertIn('repeat(2,minmax(0,1fr));gap:10px', page)
    def test_lcf_uses_parent_scroll(self):
        page = (ROOT / 'index.html').read_text(encoding='utf-8')
        child = (ROOT / 'lcf/index.html').read_text(encoding='utf-8')
        self.assertIn('scrolling="no"', page)
        self.assertIn('height:900px', page)
        self.assertIn('height:900px', page)
        self.assertIn('max-width:1080px', (ROOT / 'lcf/style.css').read_text(encoding='utf-8'))
if __name__ == '__main__':
    unittest.main()
