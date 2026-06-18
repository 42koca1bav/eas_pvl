 # Der Pfad der Zacke: Visualisierung des Strecken- und Höhenverlaufs der Zahnradbahn in Stuttgart
_Entwicklung einer Cesium-basierten 3D-Webkarten-Anwendung
mit Vite als Prüfungsvorleistung im Modul Datenbeschaffung und -visualisierung_


## 0 - Inhaltsverzeichnis
<!-- TOC -->
- [0 - Inhaltsverzeichnis](#0---inhaltsverzeichnis)
- [1 - Wahl des Themas und der verwendeten Daten](#1---wahl-des-themas-und-der-verwendeten-daten)
- [2 - Laden der Daten](#2---laden-der-daten)
- [3 - Überarbeiten der Pfad](#3---überarbeiten-der-pfad)
<!-- /TOC -->

-----

## 1 - Wahl des Themas und der verwendeten Daten

Nach Sichtung der auf https://opengeodata.lgl-bw.de/#/ verfügbaren Datensätze wurde sich entschieden, eine Echtzeit-Visualisierung des Fahrtverlaufs für die Zacke in Stuttgart zu erstellen. Da immer maximal zwei Züge der Zahnradbahn gleichzeitig die Strecke vom Marienplatz zum Bahnhof in Degerloch fahren und die Fahrt nur wenige Minuten dauert, wurde dies als kleines, anschauliches Projekt gewählt.

Dafür wurden folgende die Gebäudemodellsätze mit LoD2 heruntergeladen, welchen den da  Streckenverlauf der Zacke abdecken: 
- LoD2_32_512_5399_1_BW.gml
- LoD2_32_512_5400_1_BW.gml
- LoD2_32_512_5401_1_BW.gml  

Für den Pfad der Zacke liegt ein OSM Datensatz unter der Referenznummer 935322 vor.

Bevor der fertige Code in ein Vite-Project geladen wird, wird zum einfacheren Testen zunächst mit dem Cesium Sandcastle Editor gearbeitet. Der aktuelle Code kann in [ZackeVisualizer.js](https://gitlab.rz.hft-stuttgart.de/42koca1bav/eas_pvl_koehler/-/blob/7a4cd49b8db82a75595a2ab7bd67eee9850a1957/ZackeVisualizer.js) eingesehen und so in Sandcastle ausgeführt werden.


## 2 - Laden der Daten

Um den Pfand der Zacke ansprechend zu visualisieren laden wir zunächst das Terrain, Modelle der umliegenden Gebäude und die rohen Pfaddaten der Zacke in CeasiumJS.

```js
// Zugriff auf Cesium Ion assets
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1YzFhMTE4OC1mNzk5LTQzNmUtYmFiZS01ZTE4MWUyMGViMmIiLCJpZCI6NDQzMjM5LCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3ODExODcxMzZ9.CHvYAKAeCDVSqVGYfpe91RHwvh8-9l1hDi04hWZwt1A";


// lade Cesium World terrain und erlaube animationen
const viewer = new Cesium.Viewer("cesiumContainer", {
    terrainProvider: await Cesium.CesiumTerrainProvider.fromIonAssetId(1),
    shouldAnimate: true
});

// lade 3D-Gebäudetileset aus den Cesium-Assets
const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(4957647);
viewer.scene.primitives.add(tileset);

const extras = tileset.asset.extras;
if (
    Cesium.defined(extras) &&
    Cesium.defined(extras.ion) &&
    Cesium.defined(extras.ion.defaultStyle)
) {
    tileset.style = new Cesium.Cesium3DTileStyle(extras.ion.defaultStyle);
}

// lade den Pfad der Zacke aus der OSM Datenbank
const overpassQuery = `[out:json];rel(935322);way(r);out geom;`;
const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

const response = await fetch(url);
const data = await response.json();

const zackeDataSource = new Cesium.CustomDataSource("Zacke Accurate Path");
viewer.dataSources.add(zackeDataSource);
```

## 3 - Überarbeiten und Anzeigen der Pfaddaten

Der OSM Datensatz zur Zacke enthält zusätzlich Informationen zu den einzelnen Haltestellen und die einzelnen Abschnitte sind nicht als eine durchgehende Strecke definiert. Dh. die Daten müssen bereinigt und in die richtige Reihenfolge gebracht werden.

```js
// filtere nur Elemente mit Geometrie heraus
const ways = data.elements.filter(w => w.type === "way" && w.geometry);
const chainedGeometry = [];

if (ways.length > 0) {
    
    // füge den ersten gefundenen Pfad zur Liste hinzu
    let currentWay = ways.shift();
    chainedGeometry.push(...currentWay.geometry);

    // füge anschließende Abschnitte hinzu bis keine mehr gefunden werden können
    while (ways.length > 0) {
        const firstNode = chainedGeometry[0];
        const lastNode = chainedGeometry[chainedGeometry.length - 1];

        let connectedAtEnd = false;
        let connectedAtStart = false;

        // versuche den gefundenen Abschnitt ans Ende des Pfades anzufügen
        for (let i = 0; i < ways.length; i++) {
            const w = ways[i];
            const wFirst = w.geometry[0];
            const wLast = w.geometry[w.geometry.length - 1];

            if (wFirst.lon === lastNode.lon && wFirst.lat === lastNode.lat) {
                const nextWay = ways.splice(i, 1)[0];
                chainedGeometry.push(...nextWay.geometry.slice(1));
                connectedAtEnd = true;
                break;
            } else if (wLast.lon === lastNode.lon && wLast.lat === lastNode.lat) {
                const nextWay = ways.splice(i, 1)[0];
                chainedGeometry.push(...nextWay.geometry.slice().reverse().slice(1));
                connectedAtEnd = true;
                break;
            }
        }
        if (connectedAtEnd) continue;

        // versuche den gefundenen Abschnitt an den Anfang des Pfades anzufügen
        for (let i = 0; i < ways.length; i++) {
            const w = ways[i];
            const wFirst = w.geometry[0];
            const wLast = w.geometry[w.geometry.length - 1];

            if (wLast.lon === firstNode.lon && wLast.lat === firstNode.lat) {
                const nextWay = ways.splice(i, 1)[0];
                chainedGeometry.unshift(...nextWay.geometry.slice(0, -1));
                connectedAtStart = true;
                break;
            } else if (wFirst.lon === firstNode.lon && wFirst.lat === firstNode.lat) {
                const nextWay = ways.splice(i, 1)[0];
                chainedGeometry.unshift(...nextWay.geometry.slice().reverse().slice(0, -1));
                connectedAtStart = true;
                break;
            }
        }

        // Wenn der gefundene Pfad weder am Anfang noch Ende angefügt werden kann, ist es eine Haltestelle oder ähnliches, also beenden wir den loop
        if (!connectedAtEnd && !connectedAtStart) break;
    }
}

// convertiere den zusammengesetzten Pfad in Cesium Nodes
const pathPositions = [];
chainedGeometry.forEach(node => {
    pathPositions.push(Cesium.Cartesian3.fromDegrees(node.lon, node.lat));
});

// zeichne den Pfad
zackeDataSource.entities.add({
    polyline: {
        positions: pathPositions,
        width: 4,
        clampToGround: true,
        classificationType: Cesium.ClassificationType.BOTH,
        material: new Cesium.Color(200 / 255, 100 / 255, 50 / 255, 1.0)
    }
});
```