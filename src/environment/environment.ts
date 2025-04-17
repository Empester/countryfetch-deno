import home_dir from "https://deno.land/x/dir@1.4.0/home_dir/mod.ts";
import { join } from "https://deno.land/std@0.144.0/path/mod.ts";

const home = home_dir();
if (!home) {
  throw new Error("Unable to determine home directory.");
}

export const environment = {
  baseUrl: "https://restcountries.com/v3.1/",
  syncInterval: 7,
  cacheDir: join(home, ".cache", "countryfetch"),
  flagWidth: 40,
  queries:
    "all?fields=name,capital,currencies,population,flags,languages,region,subregion,timezones,latlng",
};
