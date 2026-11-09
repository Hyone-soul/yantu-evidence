"""Extract bounded public files without executing scripts or macros."""
import sys,json,re,io,zipfile
from pathlib import Path
from urllib.parse import urljoin,urlparse,parse_qs,unquote
from bs4 import BeautifulSoup
sys.stdout.reconfigure(encoding='utf-8')
url=sys.argv[2]; blocks=[]; links=[]; title=''; error=None; members=0; tables=[]; expandedBytes=0; publishedAt=None
memberBudget=int(sys.argv[3]) if len(sys.argv)>3 else 12
expandedBudget=int(sys.argv[4]) if len(sys.argv)>4 else 40*1024**2

def add(text,locator):
    text=re.sub(r'[ \t\u3000]+',' ',text).strip()
    for i in range(0,len(text),6500):
        part=text[i:i+6500]
        if part.strip(): blocks.append({'id':'b'+str(len(blocks)+1),'text':part,'locator':locator+(' · 段'+str(i//6500+1) if len(text)>6500 else '')})

def excel_rows(rows,name):
    rows=[list(row) for row in rows]; lines=[]; header=None
    for index,row in enumerate(rows,1):
        vals=[str(v) if v is not None else '' for v in row]
        if any(vals): lines.append('第'+str(index)+'行 | '+' | '.join(vals))
        if sum(any(word in v for v in vals) for word in ['专业','研究方向','院系所'])>=3: header=vals
    add('\n'.join(lines),name+' · 工作表行号见正文')
    if not header:
        record_table(rows,name)
    if header:
        out=[]
        for index,row in enumerate(rows,1):
            vals=[str(v) if v is not None else '' for v in row]
            if not any(re.match(r'^\d{6}',v) for v in vals): continue
            text=' | '.join(header[i]+'：'+v for i,v in enumerate(vals) if v and i<len(header))
            add(text,name+' · 第'+str(index)+'行（按表头转写）')
            out.append({'cells':vals,'row':index,'blockId':blocks[-1]['id'],'locator':blocks[-1]['locator']})
        tables.append({'name':name,'headers':header,'rows':out})

def record_table(rows,name):
    if not rows or len(rows)>20000: return
    rows=[[re.sub(r'\s+',' ',str(c or '')).strip() for c in row] for row in rows]
    hi=next((i for i,row in enumerate(rows[:8]) if any('专业' in x for x in row) and any(re.search('姓名|成绩|人数|分数|学习|科目|总分|单科|计划',x) for x in row)),None)
    if hi is None: return
    header=rows[hi]; out=[]
    for i,row in enumerate(rows[hi+1:],hi+2):
        if not any(row): continue
        text=' | '.join((header[j] or '空列')+'：'+v for j,v in enumerate(row) if v and j<len(header))
        if not text: continue
        add(text,name+' · 第'+str(i)+'行（按表头转写）')
        out.append({'cells':row,'row':i,'blockId':blocks[-1]['id'],'locator':blocks[-1]['locator']})
    tables.append({'name':name,'headers':header,'rows':out})

def html_table(table,name):
    occupied={}; rows=[]
    trs=[tr for tr in table.find_all('tr') if tr.find_parent('table') is table]
    for ri,tr in enumerate(trs):
        row=[]; ci=0
        for cell in tr.find_all(['td','th'],recursive=False):
            while (ri,ci) in occupied: row.append(occupied[(ri,ci)]); ci+=1
            value=cell.get_text(' ',strip=True)
            rs=min(500,int(cell.get('rowspan') or 1));cs=min(40,int(cell.get('colspan') or 1))
            for dr in range(rs):
                for dc in range(cs): occupied[(ri+dr,ci+dc)]=value
            for dc in range(cs): row.append(value);ci+=1
        while (ri,ci) in occupied: row.append(occupied[(ri,ci)]);ci+=1
        rows.append(row)
    record_table(rows,name)

def read(data,label='',depth=0):
    global title,members,expandedBytes,publishedAt
    if data.startswith(b'%PDF'):
        import fitz
        doc=fitz.open(stream=data,filetype='pdf')
        for i,page in enumerate(doc):
            add(page.get_text(sort=True),label+'第'+str(i+1)+'页')
            try:
                for ti,table in enumerate(page.find_tables().tables): record_table(table.extract(),label+'第'+str(i+1)+'页 · 表'+str(ti+1))
            except Exception: pass
        if not title and len(doc): title=next((line.strip() for line in doc[0].get_text().splitlines() if re.search(r'20\d{2}年.*(硕士|复试|录取|招生)',line)),doc[0].get_text().strip().split('\n')[0])
    elif data[:8]==bytes.fromhex('D0CF11E0A1B11AE1'):
        try:
            import xlrd
            wb=xlrd.open_workbook(file_contents=data)
            for sheet in wb.sheets(): excel_rows([sheet.row_values(r) for r in range(sheet.nrows)],label+sheet.name)
        except Exception: raise ValueError('旧式Word二进制格式尚无可靠解析器，请查看原始附件')
    elif data.startswith(b'PK'):
        z=zipfile.ZipFile(io.BytesIO(data)); names=z.namelist()
        if 'word/document.xml' in names:
            from xml.etree import ElementTree as ET
            tree=ET.fromstring(z.read('word/document.xml')); ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            text='\n'.join(''.join(t.text or '' for t in para.findall('.//w:t',ns)) for para in tree.findall('.//w:p',ns))
            add(text,label+'Word正文')
        elif 'xl/workbook.xml' in names:
            import openpyxl
            wb=openpyxl.load_workbook(io.BytesIO(data),data_only=True,read_only=True)
            for sheet in wb: excel_rows(sheet.values,label+sheet.title)
        else:
            if depth>=1: raise ValueError('不解析嵌套压缩包')
            entries=[i for i in z.infolist() if not i.is_dir()]
            if len(entries)>100 or sum(i.file_size for i in entries)>expandedBudget: raise ValueError('压缩包展开超出限制')
            selected=[i for i in entries if re.search(r'\.(pdf|xlsx?|docx)$',i.filename,re.I)]
            # Only computing-related syllabi are useful to this prototype.
            focused=[i for i in selected if re.search(r'计算机|软件|人工智能|数据结构|408|网络',i.filename)]
            if focused: selected=focused
            for info in selected[:memberBudget]:
                if info.file_size>8*1024**2: continue
                members+=1; expandedBytes+=info.file_size; read(z.read(info),label+'附件 '+info.filename+' / ',depth+1)
    else:
        soup=BeautifulSoup(data,'html.parser')
        if soup.title and not title: title=soup.title.get_text(' ',strip=True)
        date=re.search(r'(?:发布时间|发表时间|发布日期|日期)[：:\s]*(20\d{2}[-./年]\d{1,2}[-./月]\d{1,2})',soup.get_text(' ',strip=True))
        if date: publishedAt=date.group(1)
        for tag in soup.find_all(lambda tag: tag.name in ['a','iframe','embed','object'] or tag.has_attr('pdfsrc') or tag.has_attr('fsrc')):
            href=tag.get('pdfsrc') or tag.get('fsrc') or tag.get('href') or tag.get('src') or tag.get('data') or ''
            if not href or href.startswith(('javascript:','mailto:','#')): continue
            dest=urljoin(url,href); query=parse_qs(urlparse(dest).query); nested=query.get('file') or query.get('url')
            if nested and re.search(r'\.(pdf|xlsx?|docx?)(?:$|\?)',unquote(nested[0]),re.I): dest=urljoin(url,unquote(nested[0]))
            if urlparse(dest).scheme in ['http','https']: links.append({'url':dest,'title':tag.get_text(' ',strip=True) or tag.get('title','')})
        for tag in soup(['script','style','nav','header','footer','noscript']): tag.decompose()
        for tag in soup('form'): tag.unwrap()
        candidates=[]
        for sel in ['#vsb_content','#vsb_content_2','.wp_articlecontent','.v_news_content','.article-content','.article_content','article']: candidates.extend(soup.select(sel))
        body=max(candidates,key=lambda n:len(n.get_text()),default=soup.body or soup)
        for heading in body.select('h1,h2,h3,h4'):
            candidate=heading.get_text(' ',strip=True)
            if re.search(r'20\d{2}',candidate) and re.search('硕士|复试|录取|招生|成绩',candidate): title=candidate;break
        for ti,table in enumerate(body.find_all('table')): html_table(table,label+'正文表'+str(ti+1))
        text=body.get_text('\n',strip=True)
        if '验证码' in text and ('下载附件' in text or len(text)<300): raise ValueError('附件需要验证码，未取得附件正文')
        add(text,label+'正文')
try:
    read(Path(sys.argv[1]).read_bytes())
    if blocks and not title: title=blocks[0]['text'].split('\n')[0][:120]
    if not blocks: error='未取得可提取文字，可能为扫描件或动态页面'
except Exception as e: error='文档解析失败：'+str(e)[:180]
print(json.dumps({'title':title,'blocks':blocks,'links':links,'error':error,'members':members,'expandedBytes':expandedBytes,'parserVersion':7,'tables':tables,'publishedAt':publishedAt},ensure_ascii=False))
