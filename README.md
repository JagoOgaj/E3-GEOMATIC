# E3-S1-GEOMATIC

## Parser (pre-processing)

The parser is built in NodeJS, and will pre-process all the data needed for this project.

### Installation

1. Install NodeJS on your machine
2. Clone this repository
3. Download the companies dataset [here](https://public.opendatasoft.com/explore/assets/economicref-france-sirene-v3/) and put it in `e3-s1-geomatic-parser/dataset/source/entreprises/`. Name it `sirene.parquet`. *(Size: ~7.0GB)*
4. Download the transports dataset [here](https://transport.data.gouv.fr/datasets/arrets-de-transport-en-france) and put it in `e3-s1-geomatic-parser/dataset/source/transport/arrets-transport/`. Name it `arrets-transport.csv`. *(Size: ~150MB)*
5. Download the job offers dataset [here](https://api.apprentissage.beta.gouv.fr/fr/documentation-technique/try) and put it in `e3-s1-geomatic-parser/dataset/source/offre-alternance/`. Name it `offre-alternance.json`. *(Size: ~28MB)*

To edit/override the configuration file, you can create an `.env` file next to the `.env.defaults`.

### Run parser (Linux)

_:warning: Importing the database seems to require around 10GB of free RAM. The process could ignore `DB_MEMORY_LIMIT`.\
Please set up memory swapping or close programs if necessary._

_:warning: The process is intensive and requires 10+ minutes of compute time._

Once installed, to run the parser, execute the following commands:

```bash
cd e3-s1-geomatic-parser
npm install
npm run parser
```

## App (front-end)

:warning: Make sure to run the parser, or download all pre-processed outputs before running the app!

### Installation

1. Download, or create with the parser, the data required for the app. **TODO: Add download link**
2. Extract the files in `e3-s1-geomatic-app`.
