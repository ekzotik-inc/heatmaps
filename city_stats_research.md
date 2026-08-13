# Справочная статистика новых городов

## Base methodology

For the new city cards, city population uses the latest consistent city-level figures available in the checked sources. Regional wage uses the National Statistics Committee’s official January–September 2025 average monthly nominal accrued wage by region, expressed in million soums per month. The UI explicitly labels the population source/date and the wage source/period; no city-level wage is invented where only regional wage is available.

Official wage source: [National Statistics Committee — average monthly wage by region, January–September 2025](https://stat.uz/en/press-center/news-of-committee/64856-ajsi-ududlarda-rtacha-ojlik-ish-a-i-yu-ori-4). The reported regional figures are: Syrdarya 4.9308m, Surkhandarya 4.3472m, Jizzakh 4.5890m, Navoi 7.6123m, Kashkadarya 4.2708m, Namangan 4.5438m, Karakalpakstan 4.9023m, Khorezm 4.8337m, and Tashkent region 5.8036m soums/month.

Population context source: [National Statistics Committee — permanent population by region at 1 January 2024](https://stat.uz/ru/press-tsentr/novosti-goskomstata/49355-hududlar-kesimida-2024-yil-boshiga-doimiy-aholi-soni-2). This source is used for regional context only, not substituted for city population.

City list cross-check: [Wikipedia — List of cities in Uzbekistan](https://en.wikipedia.org/wiki/List_of_cities_in_Uzbekistan), whose 2024 table gives Namangan 713,500; Nukus 345,000; Qarshi 301,000; Termez 207,000; Jizzakh 200,600; Chirchiq 175,000; Urgench 156,000; and Shahrisabz 149,000.

Additional city-level cross-checks: [Guliston — Wikipedia](https://en.wikipedia.org/wiki/Guliston) reports 90,398 in 2020; [GoldenPages administrative overview](https://www.goldenpages.uz/en/administrative/) reports Gulistan 99.3 thousand on 6 May 2024; [Denov — Wikipedia](https://en.wikipedia.org/wiki/Denov) reports 78,300 in 2016 and confirms the city’s Surxondaryo location; [Orexca — Denau](https://www.orexca.com/rus/uzbekistan/denau.htm) confirms the Russian city identity and region. Zarafshan is kept as a clearly labelled estimate because a single current city-level official figure was not available in the same consolidated source set.

## Values selected for the UI

| City | Population used | Population note | Region wage, million UZS/month | Region |
|---|---:|---|---:|---|
| Гулистан | 99,300 | GoldenPages, 06.05.2024 | 4.93 | Сырдарьинская область |
| Денау | 78,300 | Wikipedia, 2016 | 4.35 | Сурхандарьинская область |
| Джизак | 200,600 | 2024 city table | 4.59 | Джизакская область |
| Зарафшан | 100,000 | estimate, city sources report 100k+ | 7.61 | Навоийская область |
| Карши | 301,000 | 2024 city table | 4.27 | Кашкадарьинская область |
| Наманган | 713,500 | 2024 city table | 4.54 | Наманганская область |
| Нукус | 345,000 | 2024 city table | 4.90 | Республика Каракалпакстан |
| Термез | 207,000 | 2024 city table | 4.35 | Сурхандарьинская область |
| Ургенч | 156,000 | 2024 city table | 4.83 | Хорезмская область |
| Шахрисабз | 149,000 | 2024 city table | 4.27 | Кашкадарьинская область |
| Чирчик | 175,000 | 2024 city table | 5.80 | Ташкентская область |

The existing product-wide assumptions remain unchanged: adult share is an estimate from age structure, smoking rates remain the country-level rates already documented in the project, and the “smokers 21+” tile is therefore an estimate derived from the selected population, adult share and existing smoking-rate assumptions.

Additional cross-checks from the opened city pages: [Denov](https://en.wikipedia.org/wiki/Denov) reports 68,994 in 2011 and 78,300 in 2016; [Guliston](https://en.wikipedia.org/wiki/Guliston) reports 90,398 in 2020. For the UI, the more recent 99.3k Gulistan figure from the GoldenPages administrative overview is retained, while Denau uses the more explicit 78.3k city figure from 2016 rather than the older tourism figure of 130.5k (2017) that may refer to a broader administrative context.
