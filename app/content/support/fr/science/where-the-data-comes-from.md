---
title: D’où viennent les données
summary: Les engins spatiaux, les observatoires et les modèles derrière chaque valeur de Polar Lights.
order: 60
---
Polar Lights n’effectue pas ses propres mesures. L’application rassemble les données en direct des agences spatiales et des centres de recherche, et calcule ce qu’elles signifient pour votre lieu.

## Le vent solaire : DSCOVR et ACE

Les sondes **DSCOVR** de la NOAA et **ACE** de la NASA se trouvent au point L1, à environ **1,5 million de km** de la Terre en direction du Soleil, et mesurent le vent solaire avant qu’il ne nous atteigne. Selon sa vitesse, le vent met environ **15 à 60 minutes** pour aller de L1 à la Terre : c’est le délai d’avertissement qu’elles offrent. La sonde **SOLAR-1** de la NOAA (lancée sous le nom de SWFO-L1), au même point depuis janvier 2026, emporte aussi le coronographe CCOR-2.

## L’aurore : le modèle OVATION de la NOAA

Le modèle **OVATION** transforme le vent solaire mesuré à L1 en une carte de la chance d’aurore au-dessus de vous autour de chaque pôle, pour les 30 à 90 prochaines minutes environ. Il est mis à jour toutes les quelques minutes. Il alimente la carte **Ovale auroral**, le calque Aurore de la carte, la valeur **Aurore** de **Votre ciel** et les premières heures de l’indice **Ce soir**.

## Le Kp

L’indice **Kp** provient du réseau de magnétomètres au sol du GFZ Potsdam et des estimations de la NOAA, avec la prévision de la NOAA pour les trois prochains jours et sa tendance sur 27 jours au-delà.

## Le Soleil

- **SDO** (Solar Dynamics Observatory) **de la NASA** prend les images ultraviolettes, l’image des taches solaires en lumière visible et le magnétogramme.
- **SOHO, de l’ESA et de la NASA**, emporte les coronographes LASCO qui montrent les CME quittant le Soleil.
- **Le satellite GOES-19 de la NOAA** emporte le télescope ultraviolet SUVI, le coronographe CCOR-1, les capteurs de rayons X qui mesurent les éruptions et les capteurs de protons sur lesquels repose l’échelle de rayonnement.
- **La base de données DONKI de la NASA** fournit les prévisions d’arrivée des CME du modèle WSA-Enlil.

## Météo et obscurité

- **Les prévisions de nuages** proviennent d’Open-Meteo ; la **vérification satellite des nuages**, des images infrarouges d’EUMETSAT.
- **L’obscurité et la Lune** sont calculées dans l’application à partir de votre position et de l’heure.
- Le calque **Lumières** de la carte, qui montre les lumières des villes, provient du Black Marble de la NASA.

## Sources

- [NOAA SWPC: Real-time solar wind](https://www.swpc.noaa.gov/products/real-time-solar-wind)
- [NASA Earthdata: DSCOVR](https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/dscovr)
- [NOAA SWPC: Aurora 30-minute forecast](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast)
- [GFZ Potsdam: Kp index](https://kp.gfz.de/en/)
- [NASA: Solar Dynamics Observatory](https://sdo.gsfc.nasa.gov/)
- [ESA/NASA: SOHO](https://soho.nascom.nasa.gov/)
- [NASA CCMC: DONKI](https://kauai.ccmc.gsfc.nasa.gov/DONKI/)
