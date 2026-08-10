from html.parser import HTMLParser; class MyHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
    def handle_starttag(self, tag, attrs):
        if tag not in ['br','hr','img','input','meta','link']: self.stack.append((tag, self.getpos()))
    def handle_endtag(self, tag):
        if not self.stack: print(f'Unmatched end tag {tag} at {self.getpos()}'); return
        if self.stack[-1][0] == tag: self.stack.pop()
        else: print(f'Mismatched end tag {tag} at {self.getpos()}, expected {self.stack[-1][0]}')

p = MyHTMLParser()
p.feed(open('src/Views/admin/index.html', encoding='utf-8').read())
if p.stack: print('Unclosed tags:', p.stack)

