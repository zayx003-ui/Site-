def h(c): c=c.lstrip('#'); return tuple(int(c[i:i+2],16) for i in (0,2,4))
def lum(c):
    def f(v): v/=255; return v/12.92 if v<=.03928 else ((v+.055)/1.055)**2.4
    r,g,b=map(f,c); return .2126*r+.7152*g+.0722*b
def cr(a,b):
    la,lb=lum(a),lum(b); la,lb=max(la,lb),min(la,lb); return (la+.05)/(lb+.05)
def mix(a,b,p): return tuple(round(a[i]*p+b[i]*(1-p)) for i in range(3))
T={'light':dict(bg='#F6F8FB',card='#FFFFFF',card2='#F1F5F9',text='#17243A',muted='#5B6B82',cm='#1F55D6',td='#7C3AED',tp='#0E7490',ex='#C42222',auto='#56657A',ok='#116B33',warn='#9A4A06',bad='#B01818',on='#FFFFFF',
 accents=['#0B6E7F','#1F5FBF','#4C4FC4','#236B43','#8A3E86'],ue=['#0F766E','#1F55D6','#4F46E5','#A21CAF','#436C0D']),
 'dark':dict(bg='#0B1220',card='#111C2D',card2='#172438',text='#F1F5F9',muted='#94A3B8',cm='#7DB2FF',td='#B79CFF',tp='#4DD4E8',ex='#FF8A8A',auto='#A3B2C7',ok='#4ADE80',warn='#FBBF24',bad='#F87171',on='#06202A',
 accents=['#3CB6C8','#6AA2F5','#9A9CF2','#5CCB93','#D58BD0'],ue=['#2DD4BF','#60A5FA','#818CF8','#E879F9','#A3E635'])}
bad=0
for th,t in T.items():
    C={k:h(v) for k,v in t.items() if isinstance(v,str)}
    pairs=[('texte/fond',C['text'],C['bg']),('texte/carte',C['text'],C['card']),('muted/fond',C['muted'],C['bg']),('muted/carte',C['muted'],C['card']),('muted/card2',C['muted'],C['card2'])]
    for k in ['cm','td','tp','ex','auto']:
        pairs.append((f'{k}/carte',C[k],C['card'])); pairs.append((f'{k} sur teinte 12%',C[k],mix(C[k],C['card'],.12))); pairs.append((f'{k} sur teinte 6%+carte (texte noir)',C['text'],mix(C[k],C['card'],.06)))
    for k in ['ok','warn','bad']:
        pairs.append((f'{k}/carte',C[k],C['card'])); pairs.append((f'{k} sur teinte 14%',C[k],mix(C[k],C['card'],.14)))
    for i,a in enumerate(t['accents']):
        A=h(a); pairs.append((f'accent{i}/fond',A,C['bg'])); pairs.append((f'accent{i}/carte',A,C['card'])); pairs.append((f'on-accent/accent{i}',C['on'],A)); pairs.append((f'accent{i} sur teinte 13% (nav)',A,mix(A,C['bg'],.13)))
    for i,u in enumerate(t['ue']): U=h(u); pairs.append((f'UE{i+1}/carte',U,C['card'])); pairs.append((f'UE{i+1} sur teinte 12%',U,mix(U,C['card'],.12)))
    for n,a,b in pairs:
        r=cr(a,b)
        if r<4.5: bad+=1; print(f'{th:5} {n:34} {r:.2f}')
print('paires < 4,5:',bad)
