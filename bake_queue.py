import json,math,time,re,urllib.request,urllib.parse,os,sys
ROOT="/Users/chasehejtmanek/Desktop/spotlabeler"
SPOTS="/Users/chasehejtmanek/Desktop/parkourmap/public/spots-world.json"
NYC=(40.7128,-74.0060)
N=int(os.environ.get("N","2000"))
HDR={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36","Referer":"https://www.google.com/maps/"}
def dkm(a,b):
    dy=(a[0]-b[0])*111; dx=(a[1]-b[1])*111*math.cos(math.radians(a[0])); return math.hypot(dx,dy)
def get(u,t=15): return urllib.request.urlopen(urllib.request.Request(u,headers=HDR),timeout=t).read().decode('utf8','ignore')
def panoid_at(lat,lng):
    pb=(f"!1m5!1sapiv3!5sUS!11m2!1m1!1b0!2m4!1m2!3d{lat}!4d{lng}!2d50!3m10!2m2!1sen!2sUS!9m1!1e2!11m4!1m3!1e2!2b1!3e2!4m10!1e1!1e2!1e3!1e4!1e8!1e6!5m1!1e2!6m1!1e2")
    try:
        r=get("https://maps.googleapis.com/maps/api/js/GeoPhotoService.SingleImageSearch?pb="+urllib.parse.quote(pb,safe='!*')+"&callback=x")
        m=re.search(r'\[2,"([A-Za-z0-9_\-]{22})"\]',r); return m.group(1) if m else None
    except Exception: return None
d=json.load(open(SPOTS))
d.sort(key=lambda s: dkm((s['lat'],s['lng']),NYC))
cand=d[:N]
out=[]; done=0; hit=0
t0=time.time()
for s in cand:
    pid=panoid_at(s['lat'],s['lng']); done+=1
    if pid:
        hit+=1
        out.append({"id":s.get("id"),"name":s.get("name"),"lat":round(s['lat'],6),"lng":round(s['lng'],6),
                    "km":round(dkm((s['lat'],s['lng']),NYC),1),"panoid":pid})
    if done%50==0:
        json.dump(out,open(os.path.join(ROOT,"spots-queue.json"),"w"))
        print(f"[{time.strftime('%H:%M:%S')}] {done}/{N} scanned, {hit} with pano  ({time.time()-t0:.0f}s)",flush=True)
    time.sleep(0.05)
json.dump(out,open(os.path.join(ROOT,"spots-queue.json"),"w"))
print(f"DONE {done} scanned, {hit} panos -> spots-queue.json",flush=True)
