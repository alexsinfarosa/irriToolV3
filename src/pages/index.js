import React from "react"

import fetchData from "../utils/fetchData"
import useFetchAllStations from "../utils/hooks/useFetchAllStations"
import vXdef from "../utils/vXdef.json"

import { stationIdAdjustment } from "../utils/utils"
import { format } from "date-fns"
import dataFetchReducer from "../utils/reducers/dataFetchReducer"

const IndexPage = () => {
  // ALL STATIONS ---------------------------------------------------
  const { data: stations, isLoading, isError } = useFetchAllStations()
  // const myStation = stations.find(stn => stn.name === "Geneva")
  const myStation = stations.find(stn => stn.id === "kalb")

  // SLECTED STATION ------------------------------------------------
  const [selectedStation, dispatchSelectedStation] = React.useReducer(
    dataFetchReducer,
    {
      isLoading: false,
      isError: false,
      data: null,
    }
  )

  const fetchHourlyData = async stn => {
    const vX = JSON.parse(JSON.stringify(vXdef)).find(
      e => e.network === stn.network
    )

    const params = {
      id: stationIdAdjustment(stn),
      network: stn.network,
      sid: `${stationIdAdjustment(stn)} ${stn.network}`,
      sdate: `${new Date().getFullYear() - 1}-12-31`,
      edate: `${format(new Date(), "yyyy-MM-dd")}`,
      meta: "tzo",
      // THE ORDER OF THE PARAMETERS BELOW (elems and eleList) IS VERY IMPORTANT
      elems: [
        { vX: vX["temp"], prec: 2, units: "degreeF" },
        { vX: vX["rhum"] },
        { vX: vX["pcpn"], prec: 2 },
      ],
      eleList: ["temp", "rhum", "pcpn"],
    }

    dispatchSelectedStation({ type: "FETCH_INIT" })
    try {
      const res = await fetchData(params)
      dispatchSelectedStation({
        type: "FETCH_SUCCESS",
        payload: res,
      })
    } catch (error) {
      dispatchSelectedStation({ type: "FETCH_FAILURE" })
    }
  }

  React.useEffect(() => {
    if (stations.length !== 0) {
      fetchHourlyData(myStation)
    }
  }, [stations])

  // console.log(selectedStation)
  return (
    <div>
      {isLoading && <div style={{ color: "red" }}>Loading..</div>}
      {isError ? (
        <div>There was an error</div>
      ) : (
        <div>
          <pre>{JSON.stringify(myStation, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

export default IndexPage
