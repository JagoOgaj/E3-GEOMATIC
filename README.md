# E3-S1-GEOMATIC

## Parser (pre-processing)

The parser is built in NodeJS, and will pre-process all the data needed for this project.

### Installation

1. Install NodeJS on your machine
2. Clone this repository
3. Download the companies dataset [here](https://git.disroot.org/Jago/E3-S1-GEOMATIC/src/branch/raw-data/companies_with_location) and put it in `e3-s1-geomatic-parser/dataset/source/entreprises/`. Name it `sirene.parquet`. *(Size: ~7.0GB)*
4. Download the transports dataset [here](https://git.disroot.org/Jago/E3-S1-GEOMATIC/src/branch/raw-data/arrets-transport) and put it in `e3-s1-geomatic-parser/dataset/source/transport/arrets-transport/`. Name it `arrets-transport.csv`. *(Size: ~150MB)*
5. Download the job offers dataset [here](https://git.disroot.org/Jago/E3-S1-GEOMATIC/src/branch/raw-data/job_offers) and put it in `e3-s1-geomatic-parser/dataset/source/offre-alternance/`. Name it `offre-alternance.json`. *(Size: ~28MB)*

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
