import { environment } from "./environment/environment.ts";
import {
  Country,
  Region,
  Currencies,
  Languages,
} from "./models/country.model.ts";
import { FlagAscii } from "./models/flag-ascii.model.ts";
import { Cache } from "./util/cache.ts";
import { Logger } from "./util/logger.ts";
import { ImageConverter } from "./util/image-converter.ts";

export class Countries {
  list: Country[] = [];
  names: string[] = [];
  flags: FlagAscii[] = [];
  query = environment.queries;

  constructor(
    private cache: Cache,
    private logger: Logger,
    private imageConverter: ImageConverter
  ) {}

  public async sync(config?: {
    force?: boolean;
    flagAscii?: boolean;
  }): Promise<Country[]> {
    if (this.shouldSync() || config?.force) {
      this.logger.alert(
        "Synchronizing countries database...",
        config?.force
          ? ""
          : `\nThis will only happen every ${environment.syncInterval} days`
      );

      // Fetch and parse countries data from API
      const response = await fetch(environment.baseUrl + this.query);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API Error: ${text}`);
      }

      const countries = (await response.json()) as Country[];

      this.list = countries;
      this.cache.saveJson("countries", countries);
      this.cache.saveTxt("last-synced", JSON.stringify(Date.now()));

      if (config?.flagAscii) {
        const logTitle =
          "Generating ASCII art for each country flag. This may take a minute...";
        const flagStrings = await this.generateFlagImgs(countries, logTitle);
        this.flags = flagStrings;
        this.cache.saveJson("flags", flagStrings);
      }

      this.logger.success(
        `Synced successfully: cache saved at ${environment.cacheDir}`
      );
    } else {
      this.list = this.cache.readJson("countries") as Country[];
      this.flags = (this.cache.readJson("flags") as FlagAscii[]) || [];
    }
    this.names = this.list.map((c) => c.name.common);
    return this.list;
  }

  public find(name: string): Country {
    name = name.toLowerCase();

    // Find exact match first
    let country = this.list.find((c) => {
      const countryName = c.name.common.toLowerCase();
      return countryName === name;
    });

    // Find fuzzy match if exact was not found
    if (!country) {
      country = this.list.find((c) => {
        const countryName = c.name.common.toLowerCase();
        return countryName.includes(name);
      });
    }

    if (!country) {
      throw `Cannot find country named ${name}`;
    }

    return country;
  }

  public filterByRegion(region: Region) {
    return this.list.filter((country) => country.region === region);
  }

  public print(name: string) {
    const country = this.find(name);
    const currencies = this.extractCurrencies(country.currencies);
    const languages = this.extractLanguages(country.languages);
    const FlagAscii = this.flags.find(
      (i) => i.countryName === country.name.common
    );

    if (FlagAscii) {
      // Display ASCII flag
      this.logger.log("\n" + FlagAscii.flagString.join("\n"));
    } else {
      this.logger.error("Flag not found for " + country.name.common);
    }

    // Handle optional fields with checks or defaults
    this.logger.logCountry({
      country: country.name.common,
      latlng: country.latlng?.join("/") ?? "N/A",  // Ensure latlng exists
      capital: country.capital?.[0] ?? "N/A",     // Capital could be an array
      flag: "Flag: " + (FlagAscii ? "Displayed" : "Not Available"), // Add flag status
      population: country.population?.toLocaleString() ?? "N/A", // Ensure population exists
      region: country.region ?? "N/A",            // Default if region is missing
      subregion: country.subregion ?? "N/A",      // Default if subregion is missing
      capitalLatLng: country.capitalInfo?.latlng?.join("/") ?? "N/A", // Safely access capital latlng
      timezones: country.timezones?.join(" | ") ?? "N/A", // Handle missing timezones
      tld: country.tld?.join(" | ") ?? "N/A",         // Safely access tld
      currencies,
      languages,
    });
  }

  public random(): string {
    const randomNum = Math.floor(Math.random() * this.names.length);
    return this.names[randomNum];
  }

  public capitalOf(capital: string): void {
    if (!capital) {
      this.logger.error("Must provide a capital name.");
      return;
    }
    const country = this.findByCapital(capital);
    this.logger.capitalOf(capital, country.name.common);
  }

  private findByCapital(capital: string): Country {
    const country = this.list.find((c) => {
      const capitalsLowercase = c.capital.map((capital) =>
        capital.toLowerCase()
      );
      return capitalsLowercase.includes(capital);
    });

    if (!country) {
      throw `Could not find the country of capital: ${capital}`;
    }

    return country;
  }

  private shouldSync() {
    const lastSynced = this.cache.readTxt("last-synced");
    const cacheExists = this.cache.exists("countries", ".json");
    const week = environment.syncInterval * 23 * 60 * 60 * 1000;
    const updateDue = Date.now() - Number(lastSynced) > week;

    return !cacheExists || !lastSynced || updateDue;
  }

  private extractCurrencies(currencies: Currencies) {
    const result = [];
    for (const currencyAbbr in currencies) {
      const currency = currencies[currencyAbbr];
      result.push(`${currency.name} (${currencyAbbr})`);
    }
    return result.join(" | ");
  }

  private extractLanguages(languages: Languages) {
    const result = [];
    for (const langAbbr in languages) {
      result.push(languages[langAbbr]);
    }
    return result.join(" | ");
  }

  private async generateFlagImgs(
    countries: Country[],

    logTitle?: string
  ): Promise<FlagAscii[]> {
    const data = [];
    let index = 0;
    for (const country of countries) {
      // Replace png with jpg as the library used has trouble with png
      const flagUrl = country.flags["png"].replace(".png", ".jpg");
      const flagString = await this.imageConverter.getImageStrings(flagUrl);
      data.push({
        countryName: country.name.common,
        flagString,
      });
      index++;
      this.logger.progress(index, countries.length, {
        title: logTitle,
        description: "Generating a flag for " + country.name.common,
      });
    }
    return data;
  }
}
