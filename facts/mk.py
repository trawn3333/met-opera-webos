# helper: mk(slug, title, match, src, facts) facts = [(type, sceneMatch, text, evidence(str|list), anchor|None, attribution|None, scope|None, source|None)]
import json, re
def mk(slug, title, match, src, facts, attr=None):
    out = []
    for i, f in enumerate(facts):
        f = list(f) + [None] * (8 - len(f))
        typ, scene, text, ev, anchor, at, scope, source = f
        source = source or src
        out.append({"id": "%s-%02d" % (slug, i + 1), "type": typ, "sceneMatch": scene, "scope": scope or "all", "text": text,
                    "attribution": at or attr or ("Wikipedia, \u201c%s\u201d" % title), "source": source, "anchor": anchor, "evidence": ev})
    json.dump({"title": title, "match": match, "facts": out}, open("titles/%s.json" % slug, "w"), ensure_ascii=False, indent=1)
