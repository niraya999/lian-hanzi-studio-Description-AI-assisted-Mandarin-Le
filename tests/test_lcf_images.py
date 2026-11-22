import importlib.util
import pathlib
import unittest

PATH = pathlib.Path(__file__).resolve().parents[1] / "scripts/enrich_lcf_images.py"
spec = importlib.util.spec_from_file_location("lcf_images", PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class ThumbnailTests(unittest.TestCase):
    def test_og_image_preferred(self):
        parser = mod.Metadata()
        parser.feed('<html><head><meta property="og:image" content="https://id.tbsn.org/assets/story.jpg"></head><body><img src="/other.jpg"></body></html>')
        self.assertEqual(parser.images[0], "https://id.tbsn.org/assets/story.jpg")

    def test_lazy_loaded_article_photo(self):
        parser = mod.Metadata()
        parser.feed('<img src="/logo.png"><img data-src="/news/photo.jpg">')
        self.assertEqual(parser.images, ["/news/photo.jpg"])

    def test_no_invented_placeholder_url(self):
        parser = mod.Metadata()
        parser.feed('<html><head><title>No photo</title></head></html>')
        self.assertEqual(parser.images, [])

if __name__ == "__main__":
    unittest.main()
