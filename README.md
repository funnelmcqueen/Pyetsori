# Pyetësori XAUUSD

Produkt i FunnelMcQueen, by Veli Reci.

Pyetësor për telefon që mbledh rregullat e strategjisë së klientit për robotin XAUUSD (MT5). Kur klienti shtyp **Dorëzo përgjigjet**, serveri i validon përgjigjet dhe fotot, i ruan në **ruajtje private të përhershme**, dhe e konfirmon dorëzimin vetëm pasi gjithçka është ruajtur dhe verifikuar. Ti i hap dhe i eksporton nga **paneli privat** (`/admin`).

Klienti nuk ka nevojë për llogari, nuk jep emër as email, dhe nuk ka nevojë të të dërgojë asgjë vetë.

## Pyetësori

Shtatë pjesë me gjuhë të thjeshtë, secila me ekrane të vegjël:

1. Çfarë tregton?
2. Kur hap një trade? (cilësimet e çdo indikatori në ekranin e vet, vetëm nëse zgjidhet)
3. Kur e mbyll?
4. Sa do të rrezikosh? (lot fiks, përqindje e llogarisë ose shumë fikse, pa vlerë të parazgjedhur)
5. Në cilat orare tregton?
6. Na trego disa shembuj. (të paktën një; foto grafiku dhe foto cilësimesh me përshkrim)
7. Kontrollo përgjigjet. (përmbledhje me "Ndrysho" për çdo pjesë dhe listën "Këto do t'i sqarojmë bashkë")

Termat e platformës (BUY, SELL, Stop Loss, Take Profit, lot) mbeten dhe shpjegohen herën e parë. Pyetjet teknike kanë **"Nuk e di — ta sqarojmë bashkë"**: lejon dorëzimin, ruhet si e pasqaruar, del në panel dhe në eksport, dhe nuk zëvendësohet me vlerë. Disa detaje (p.sh. monedha e llogarisë) shkojnë te lista e verifikimit për zhvilluesin. "U dorëzua me sukses" dhe "Specifikimi është gati për zhvillim" janë dy statuse të ndara: një dorëzim me paqartësi nuk shënohet gati.

## Si funksionon

1. **Dorëzimi** (`POST /api/submit`):
   - Kontroll i rreptë në server. Çdo gjë jashtë skemës refuzohet, dhe asnjë tekst nuk shkurtohet në heshtje: një tekst shumë i gjatë kthen gabim të qartë.
   - Fotot kontrollohen për llojin (JPG, PNG, WEBP), përmbajtjen, madhësinë dhe përkatësinë te shembulli.
   - Serveri cakton ID-në (p.sh. `XAU-20261005-K7M2QD`) dhe regjistron datën.
   - Ruhen fotot, `pergjigjet.json` dhe `specifikimi.txt`. Para konfirmimit verifikohet që çdo skedar ekziston me madhësinë e saktë. Në fund shkruhet `manifest.json`: vetëm atëherë dorëzimi shfaqet si i kryer.
   - Nëse diçka dështon, klienti sheh gabim, drafti mbetet në telefon dhe riprovimi përdor të njëjtin çelës. Nuk krijohet kopje e dyfishtë, dhe ID-ja mbetet e njëjta. I njëjti çelës me përmbajtje tjetër refuzohet.
2. **Ruajtja**: Vercel Private Blob. Çdo lexim kërkon autentikim dhe nuk ka URL publike. Asgjë nuk mbështetet te memoria ose skedarët e përkohshëm të funksionit.
3. **Paneli** (`/admin`):
   - Hyrje me fjalëkalim; sesioni mbahet në cookie të nënshkruar (HttpOnly, SameSite=Strict, Secure).
   - Çdo veprim kontrollohet në server, edhe çdo eksport dhe çdo foto. Faqja e panelit nuk përmban të dhëna pa hyrje.
4. **Eksporti**: nga të dhënat e ruajtura, jo nga drafti i ndonjë shfletuesi.
   - **Paketë e plotë ZIP:** `specifikimi.txt`, `pergjigjet.json` dhe `fotot/`. Nëse një foto e regjistruar mungon ose është ndryshuar, ZIP-i refuzohet me gabim dhe nuk paraqitet si i plotë.
   - **Specifikimi TXT:** gati për Claude Code, pa foto.
   - **Përgjigjet JSON:** me versionin e skemës, pa foto.
   - Emri i skedarit ka datën dhe ID-në: `pyetesori-xauusd-2026-10-05-XAU-20261005-K7M2QD.zip`.

Si rezervë, faqja e klientit ofron edhe kopjim ose shkarkim lokal kur dorëzimi dështon.

## Struktura

```
public/index.html, app.js        pyetësori
public/admin.html, admin.js      paneli privat
public/questionnaire.js          pyetjet dhe logjika (përdoren edhe nga serveri)
api/submit.js, api/admin.js      funksionet serverless (Vercel)
lib/storage.js                   ruajtja: Vercel Private Blob, dosje lokale (vetëm zhvillim)
lib/submissions.js               ruajtja e dorëzimeve, verifikimi, eksportet
lib/submit-core.js               validimi dhe dorëzimi
lib/admin-core.js                hyrja dhe autorizimi i panelit
lib/notify.js                    njoftim opsional
scripts/dev-server.js            server lokal
tests/                           testet automatike
original/                        versioni i parë, i pandryshuar
```

## 1. Provë lokale

Duhet Node.js 20 ose më i ri.

```
npm install
npm test
```

Krijo `.env` nga `.env.example` me:

```
STORAGE_DRIVER=file
STORAGE_DIR=./.data
ADMIN_PASSWORD=një-fjalëkalim-i-gjatë-të-paktën-16
ADMIN_SESSION_SECRET=(rezultati i: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

Pastaj `npm run dev`:
- pyetësori te `http://localhost:3000`
- paneli te `http://localhost:3000/admin`

Dorëzimet ruhen te `./.data`. Pa `STORAGE_DRIVER`, dorëzimet vetëm **simulohen**, dhe faqja e thotë qartë që nuk u ruajtën.

## 2. Publikimi në Vercel

1. Ngarko dosjen në një repository **privat** në GitHub (pa `.env`, `.data` dhe `node_modules`).
2. Te Vercel: **Add New → Project**, importo repo-n. Framework Preset: **Other**.
3. **Storage → Create → Blob**, zgjidh **Private**, dhe lidhe me projektin. Vercel shton vetë lidhjen (`BLOB_READ_WRITE_TOKEN` ose `BLOB_STORE_ID`).
4. **Settings → Environment Variables:**
   - `STORAGE_DRIVER` = `vercel-blob`
   - `ADMIN_PASSWORD`: të paktën 16 shenja
   - `ADMIN_SESSION_SECRET`: të paktën 32 shenja të rastësishme
5. **Deploy**, ose **Redeploy** pas çdo ndryshimi të variablave.
6. Opsionale: domain si `pyetesori.funnelmcqueen.com` te **Settings → Domains**.

Plani falas (Hobby) i Vercel është vetëm për përdorim jo-komercial. Për punë me klientë, Vercel kërkon planin Pro.

## 3. Testi i parë real

1. Hap `https://domeni-yt/?prove=1`. Me `?prove=1`, dorëzimi shënohet **Provë** në panel, që të mos ngatërrohet me dorëzimet e klientit.
2. Plotëso pyetësorin me të dhëna prove, shto 3 shembuj dhe një foto, pastaj shtyp **Dorëzo përgjigjet**. Duhet të shohësh "Përgjigjet u dorëzuan dhe u ruajtën. ID: XAU-…".
   - Nëse shkruan **"Ruajtje e simuluar"**, ruajtja nuk është konfiguruar: kontrollo hapat 3–5 të seksionit të mësipërm.
3. Hap `https://domeni-yt/admin`, hyr, dhe kontrollo që dorëzimi del me etiketën **Provë**.
4. Provo **Eksporto / Shkarko** për të tre formatet dhe hap ZIP-in.
5. Në telefon, shtyp **Fillo nga e para** për të fshirë draftin e provës.
6. Klientit jepi linkun **pa** `?prove=1`.

## Njoftimi opsional

Me `NOTIFY_EMAIL_TO` (dhe Resend ose SMTP, shih `.env.example`), merr një email të shkurtër kur vjen një dorëzim i ri: ID, data, numri i fotove dhe statusi, **pa përgjigje dhe pa foto**. Dorëzimi konfirmohet nga ruajtja, jo nga emaili. Nëse emaili dështon, dorëzimi mbetet i ruajtur.

## Siguria dhe kufizimet

- Kredencialet (`ADMIN_*`, lidhja me Blob, çelësat e emailit) janë vetëm te variablat e serverit, kurrë në HTML ose JavaScript publik.
- Pas 5 fjalëkalimeve të gabuara nga e njëjta IP, hyrja bllokohet për 15 minuta. Ky numërim, si edhe kufizimi i dorëzimeve (8 në 10 minuta për IP), mbahet në memorien e funksionit, prandaj është "best effort". Mbrojtja kryesore është fjalëkalimi i gjatë.
- Paneli nuk ka ende fshirje të dorëzimeve. Ato fshihen nga Vercel → Storage → Blob.
- Dy klikime njëkohësisht me të njëjtin çelës bllokohen brenda të njëjtës instancë të serverit. Në rastin shumë të rrallë kur dy instanca e marrin të njëjtin dorëzim në të njëjtin moment, përmbajtja është e njëjtë, por ID-ja mund të ndryshojë mes tyre. Gjithsesi del vetëm një dorëzim në panel.
- Kufijtë: deri në 8 foto (6 shembuj + 2 cilësime; telefoni i kompreson në ≤ 320 KB secilën), kërkesa ≤ 4 MB, tekstet ≤ 2,000 shenja (fushat e gjata ≤ 20,000).

## Drafti i vjetër

Faqja e lexon draftin e versioneve të mëparshme (`xau-ea-questionnaire-v11`, `xau-q:v2`), e kalon në skemën aktuale dhe ruan një kopje rezervë në `xau-q:legacy-backup`, pa e fshirë origjinalin. Kjo funksionon vetëm në të njëjtin domain.
