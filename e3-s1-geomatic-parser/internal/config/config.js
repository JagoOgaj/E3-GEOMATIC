import dotenv from 'dotenv';
import path from 'node:path';

export class Config {
    #env = {};

    constructor() {
        if (Config.instance) {
            return Config.instance;
        }
        this.#initEnv();
        Config.instance = this;
    }

    #initEnv() {
        // Load the .env files if they exist, in a specific order.
        const defaultsEnvPath = path.resolve(process.cwd(), '.env.defaults'); // This file will be committed and should contain fixed, non-sensitive infos.
        const envPath = path.resolve(process.cwd(), '.env'); // Sensitive data are supposed to be here. They will override .env.defaults
        dotenv.config({ path: [defaultsEnvPath, envPath] });
        
        this.#env = {
            DB_PATH: process.env.DB_PATH,
            PATH_SOURCE_OFFERS_JSON: process.env.PATH_SOURCE_OFFERS_JSON,
            PATH_SOURCE_SIRENE: process.env.PATH_SOURCE_SIRENE,
            PATH_OUTPUT_COMPANIES_GEOJSON: process.env.PATH_OUTPUT_COMPANIES_GEOJSON,
            PATH_OUTPUT_OFFERS_BY_SIRET_JSON: process.env.PATH_OUTPUT_OFFERS_BY_SIRET_JSON,
            PATH_OUTPUT_STOP_BY_SIRET_JSON: process.env.PATH_OUTPUT_STOP_BY_SIRET_JSON,
            PATH_OUTPUT_TRANSPORT_STOP_JSON: process.env.PATH_OUTPUT_TRANSPORT_STOP_JSON,
            PATH_OUTPUT_REQUIRED_DATASETS: process.env.PATH_OUTPUT_REQUIRED_DATASETS,
            PATH_CACHE_GTFS: process.env.PATH_CACHE_GTFS,
            PATH_SOURCE_STOP_CSV: process.env.PATH_SOURCE_STOP_CSV,
        };
    }

    getEnvValue(key) {
        return this.#env[key];
    }
}
