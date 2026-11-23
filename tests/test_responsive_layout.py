import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class ResponsiveLayoutTests(unittest.TestCase):
    def test_responsive_workspace_shell(self):
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("max-width:1600px", page)
        self.assertIn("@media(min-width:1100px)", page)
        self.assertIn("@media(min-width:700px) and (max-width:1099px)", page)
        self.assertIn("@media(orientation:landscape) and (max-height:600px)", page)
        self.assertIn("#hub,#library,#learn,#bcs,#lcf,#player,#settings,#editor,#reader", page)
        self.assertIn("#lcf iframe{display:block;width:100%;max-width:100%", page)
        self.assertIn("repeat(4,minmax(0,1fr))", page)

if __name__ == "__main__":
    unittest.main()
