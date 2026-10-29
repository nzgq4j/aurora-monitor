---
title: Varifrån data kommer
summary: Rymdfarkosterna, observatorierna och modellerna bakom varje siffra i Polar Lights.
order: 60
---
Polar Lights gör inga egna mätningar. Appen samlar data i realtid från rymdorganisationer och forskningscentrum och räknar ut vad den betyder för din plats.

## Solvinden: DSCOVR och ACE

NOAA:s **DSCOVR** och NASA:s **ACE** befinner sig vid punkten L1, ungefär **1,5 miljoner km** från jorden i riktning mot solen, och mäter solvinden innan den når oss. Beroende på vindens hastighet tar det ungefär **15 till 60 minuter** för den att färdas vidare från L1 till jorden, så det är den förvarning de ger. NOAA:s rymdfarkost **SOLAR-1** (uppskjuten som SWFO-L1), som har funnits vid samma punkt sedan januari 2026, bär också koronagrafen CCOR-2.

## Norrskenet: NOAA:s OVATION-modell

Modellen **OVATION** omvandlar solvinden som mäts vid L1 till en karta över chansen till norrsken i zenit runt varje pol, för ungefär de närmaste 30 till 90 minuterna. Den uppdateras med några minuters mellanrum. Den styr kartan **Norrskensoval**, kartans lager Norrsken, värdet **Norrsken** i **Din himmel** och de första timmarna i bedömningen **I kväll**.

## Kp

**Kp**-index kommer från GFZ Potsdams nätverk av markmagnetometrar och NOAA:s uppskattningar, med NOAA:s prognos för de närmaste tre dagarna och dess 27-dagarsutsikt längre fram.

## Solen

- **NASA:s SDO** (Solar Dynamics Observatory) tar de ultravioletta bilderna, bilden av solfläckarna i synligt ljus och magnetogrammet.
- **ESA:s och NASA:s SOHO** bär LASCO-koronagraferna som visar CME:er som lämnar solen.
- **NOAA:s satellit GOES-19** bär det ultravioletta teleskopet SUVI, koronagrafen CCOR-1, röntgensensorerna som mäter flares och protonsensorerna bakom strålningsskalan.
- **NASA:s databas DONKI** ger WSA-Enlil-modellens prognoser för när CME:er anländer.

## Väder och mörker

- **Molnprognoser** kommer från Open-Meteo; **satellitkontrollen av moln** från EUMETSAT:s infraröda bilder.
- **Mörker och månen** räknas ut i appen utifrån din position och tiden.
- **Stadsljus** på kartan kommer från NASA:s Black Marble.

## Källor

- [NOAA SWPC: Real-time solar wind](https://www.swpc.noaa.gov/products/real-time-solar-wind)
- [NASA Earthdata: DSCOVR](https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/dscovr)
- [NOAA SWPC: Aurora 30-minute forecast](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast)
- [GFZ Potsdam: Kp index](https://kp.gfz.de/en/)
- [NASA: Solar Dynamics Observatory](https://sdo.gsfc.nasa.gov/)
- [ESA/NASA: SOHO](https://soho.nascom.nasa.gov/)
- [NASA CCMC: DONKI](https://kauai.ccmc.gsfc.nasa.gov/DONKI/)
