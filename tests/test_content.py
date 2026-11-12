import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from text_normalization import DEFAULT_ACCESS_TEXT, normalize_access_text, normalize_text, normalize_html, normalize_data
from site_urls import normalize_urls


class ContentTest(unittest.TestCase):
    def test_prices_and_alternatives(self):
        self.assertEqual(normalize_text("６，０００ 円 (税込) A or B 17:30～20:15"), "6,000円 （税込） A または B 17:30〜20:15")

    def test_service_names_are_preserved(self):
        self.assertEqual(normalize_text("Formspree で予約。コースは鶏or豚。"), "Formspree で予約。コースは鶏 または 豚。")

    def test_source_code_and_urls_are_preserved(self):
        source = '<script>const n = f(1);</script><img src="a(1).webp" alt="料理(中)"><p>１，１００ 円</p>'
        self.assertEqual(normalize_html(source), '<script>const n = f(1);</script><img src="a(1).webp" alt="料理（中）"><p>1,100円</p>')
        self.assertEqual(normalize_data({"url": "https://example.com/image(1).webp"}), {"url": "https://example.com/image(1).webp"})

    def test_canonical_and_anchor_urls(self):
        self.assertEqual(normalize_urls('<a href="menu.html#menu-gohan">ご飯</a> https://ehimenomasa.pages.dev/shop.html'), '<a href="/menu#menu-gohan">ご飯</a> https://ehimenomasa.com/shop')

    def test_legacy_access_directions(self):
        legacy = (
            "【電車・バスでお越しの方へ】\n"
            "松山市駅から徒歩30秒。松山市駅・北側出口を出て、すぐの横断歩道を渡りきると正面にございます。"
            "左側にパチンコ・パワーステーションさん、右側にはひぎりやきさんがございます。\n\n"
            "【お車でお越しの方へ】\n"
            "伊予鉄高島屋さんの向かい側道路（ひぎりやきさん側）沿いにございます。"
            "ひぎりやきさんとパチンコ・パワーステーションさんの間のビル2階でございます。"
            "※申し訳ありませんが、駐車場はございません。"
            "※お車でのお持ち帰り（テイクアウト）時は、1階までお持ちいたします。"
        )
        self.assertEqual(normalize_access_text(legacy), DEFAULT_ACCESS_TEXT)
        self.assertEqual(normalize_access_text(DEFAULT_ACCESS_TEXT), DEFAULT_ACCESS_TEXT)


if __name__ == "__main__":
    unittest.main()
