import axios from "axios"
import axiosWithDelimiter from "./axiosWithDelimiter"

import { format, addDays, isSameYear } from "date-fns"
import cleanFetchedData from "./cleanFetchedData"
import {
  formatIdNetwork,
  arrToObj,
  arrToObjForecast,
  setParams,
  rhAdjustmentICAOStations,
} from "./utils"

const protocol = window.location.protocol

const errorFromAcis = acis => {
  const keyList = Object.keys(acis)
  if (keyList.includes("error")) {
    throw new Error("ACIS returned an error")
  }
  return acis
}

// Fetch selected station hourly data ---------------------------------------------------
const fetchCurrentStationHourlyData = params => {
  const url = `${protocol}//data.rcc-acis.org/StnData`
  return axios
    .post(url, params)
    .then(res => {
      // console.log(res.data)
      return arrToObj(errorFromAcis(res.data), params.eleList)
    })
    .catch(err => console.log("Failed to load station data ", err))
}

// const fetchSolarRadiationIcaoStations = params => {
//   const url = `${protocol}//adhoc.rcc-acis.org/SolarRadiation`
//   const { sid, sdate, edate } = params
//   return axios(`${url}?sid=${sid}&sdate=${sdate}&edate=${edate}`)
//     .then(res => console.log(res))
//     .catch(err =>
//       console.log("Failed to fetch solar radiation from ICAO station", err)
//     )
// }

// Fetch sister station Id and network -----------------------------------------------------
const fetchSisterStationIdAndNetwork = params => {
  const { id, network } = params
  const url = `${protocol}//newa2.nrcc.cornell.edu/newaUtil/stationSisterInfo`
  return axios(`${url}/${id}/${network}`)
    .then(res => {
      // console.log(res.data)
      return formatIdNetwork(res.data, params.eleList)
    })
    .catch(err =>
      console.log("Failed to load sister station id and network", err)
    )
}

// Fetch sister station hourly data --------------------------------------------------------
export const fetchSisterStationHourlyData = async (
  params,
  idAndNetwork,
  allStations
) => {
  const url = `${protocol}//data.rcc-acis.org/StnData`

  let sisStations = []
  for (let [key, val] of Object.entries(idAndNetwork)) {
    const [id, network] = key.split(" ")

    const station = allStations.find(
      stn => stn.id === id && stn.network === network
    )

    if (station) {
      const sisStn = setParams(station, params.sdate, params.edate, val)
      sisStations.push(sisStn)
    }
  }

  if (sisStations.length === 0) {
    console.log("No sister station")
  }
  if (sisStations.length !== 0) {
    let req = sisStations.map(stn => {
      return axiosWithDelimiter
        .post(url, stn)
        .then(res => {
          // console.log(res.data)
          return arrToObj(errorFromAcis(res.data), stn.eleList)
        })
        .catch(err => console.log("Failed to load sister station data ", err))
    })

    const res = await Promise.all(req)
    if (res.length > 1) {
      let first = [...res[0].data]
      res.slice(1)[0].data.forEach((day, i) => {
        delete day.date
        first[i] = { ...first[i], ...day }
      })
      return first
    } else {
      return res[0].data
    }
  }
}

// Fetch forecast hourly data --------------------------------------------------------------
const fetchHourlyForecastData = async params => {
  // available forecast variables:  ['temp','rhum','wspd','tsky','qpf','dwpt','pop12']
  const url = `${protocol}//newa2.nrcc.cornell.edu/newaUtil/getFcstData`
  // always need to add 5 days
  const plusFiveDays = format(addDays(new Date(), 5), "yyyy-MM-dd")
  const { id, network } = params

  let forecastElementList = [...params.eleList]
  if (forecastElementList.includes("pcpn")) {
    forecastElementList = [
      ...forecastElementList.filter(e => e !== "pcpn"),
      "pop12",
      "qpf",
    ]
  }
  if (forecastElementList.includes("lwet")) {
    forecastElementList = forecastElementList.filter(el => el !== "lwet")
  }

  let req = forecastElementList.map(el =>
    axiosWithDelimiter
      .get(`${url}/${id}/${network}/${el}/${params.sdate}/${plusFiveDays}`)
      .then(res => {
        // console.log(el, res.data)
        return arrToObjForecast(errorFromAcis(res.data), el)
      })
      .catch(err =>
        console.log(`Failed to load ${el} hourly forecast data`, err)
      )
  )

  const res = await Promise.all(req)
  if (res.length > 1) {
    let first = [...res[0]]
    res.slice(1).forEach(stn => {
      stn.forEach((day, j) => {
        delete day.date
        first[j] = { ...first[j], ...day }
      })
    })
    return first
  } else {
    return res[0]
  }
}

// Main Function
export default async (params, allStations) => {
  let results = {}

  // get current station hourly data
  const currentStation = await fetchCurrentStationHourlyData(params)
  // const solarRadiation = await fetchSolarRadiationIcaoStations(params)
  results["currentStn"] = currentStation.data
  results["tzo"] = currentStation.meta.tzo

  // get sister station id and network
  const sisterStationIdAndNetworks = await fetchSisterStationIdAndNetwork(
    params
  )
  // console.log(sisterStationIdAndNetworks)

  // get sister station hourly data
  const sisterStn = await fetchSisterStationHourlyData(
    params,
    sisterStationIdAndNetworks,
    allStations
  )

  if (params.network === "icao") {
    let sisterStnAdjusted = []
    sisterStn.forEach(day => {
      let p = { ...day }
      p["rhum"] = rhAdjustmentICAOStations(day["rhum"])
      sisterStnAdjusted.push(p)
    })
    results["sisterStn"] = sisterStnAdjusted
  } else {
    results["sisterStn"] = sisterStn
  }

  // FORECAST -----------------------------------------------------------
  if (isSameYear(new Date(), new Date(params.edate))) {
    // get forecast hourly data
    const forecast = await fetchHourlyForecastData(params)
    let res = []
    const keys = params.eleList

    forecast.forEach(day => {
      let p = { ...day }
      if (keys.includes("rhum") && params.network === "icao") {
        p["rhum"] = rhAdjustmentICAOStations(day["rhum"])
      }
      if (keys.includes("pcpn")) {
        const pcpn = day["pop12"].map((p, i) =>
          p === "M" ? p : p < 60 ? 0 : day["qpf"][i]
        )
        p["pcpn"] = pcpn
        delete p["pop12"]
        delete p["qpf"]
      }
      if (keys.includes("lwet")) {
        const adjRhum = rhAdjustmentICAOStations(day["rhum"])
        const lwet = adjRhum.map(rh => (p === "M" ? p : rh >= 90 ? 60 : 0))
        p["lwet"] = lwet
      }
      res.push(p)
    })
    // console.log(res)
    results["forecast"] = res
  }

  // clean data
  // console.log(results)
  const cleaned = cleanFetchedData(results, params)

  // console.log(cleaned)
  return cleaned
}
