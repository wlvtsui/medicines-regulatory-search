(ns dmd-search.server
  (:gen-class)
  (:require [clojure.data.json :as json]
            [clojure.string :as str]
            [com.eldrix.dmd.core :as dmd])
  (:import (com.sun.net.httpserver HttpExchange HttpHandler HttpServer)
           (java.net InetSocketAddress URLDecoder)
           (java.nio.charset StandardCharsets)
           (java.util.concurrent Executors)))

(defn- send-json! [^HttpExchange exchange status body]
  (let [bytes (.getBytes (json/write-str body) StandardCharsets/UTF_8)]
    (.set (.getResponseHeaders exchange) "Content-Type" "application/json; charset=utf-8")
    (.sendResponseHeaders exchange status (long (alength bytes)))
    (with-open [output (.getResponseBody exchange)]
      (.write output bytes))))

(defn- query-params [^HttpExchange exchange]
  (let [raw-query (.getRawQuery (.getRequestURI exchange))]
    (if (str/blank? raw-query)
      {}
      (into {}
            (map (fn [part]
                   (let [[key value] (str/split part #"=" 2)]
                     [(URLDecoder/decode key StandardCharsets/UTF_8)
                      (URLDecoder/decode (or value "") StandardCharsets/UTF_8)])))
            (str/split raw-query #"&")))))

(defn- search-handler [store ^HttpExchange exchange]
  (if (not= "GET" (.getRequestMethod exchange))
    (send-json! exchange 405 {"error" "Use GET for dm+d searches."})
    (let [term (some-> (get (query-params exchange) "q") str/trim)]
      (cond
        (str/blank? term)
        (send-json! exchange 400 {"error" "Provide a search term using ?q="})

        (> (count term) 100)
        (send-json! exchange 400 {"error" "Search terms must be 100 characters or fewer."})

        :else
        (let [matches (dmd/search store term :limit 10)
              release-date (some-> (dmd/fetch-release-date store) str)
              results (mapv (fn [match]
                             (let [product-type (:SEARCH/TYPE match)]
                               {"id" (:SEARCH/ID match)
                                "type" (if (keyword? product-type)
                                         (name product-type)
                                         (str product-type))
                                "name" (:SEARCH/NM match)}))
                           matches)]
          (send-json! exchange 200
                      {"source" "UK NHS Dictionary of Medicines and Devices (dm+d)"
                       "query" term
                       "releaseDate" release-date
                       "count" (count results)
                       "results" results}))))))

(defn- handler [store]
  (reify HttpHandler
    (handle [_ exchange]
      (let [path (.getPath (.getRequestURI ^HttpExchange exchange))]
        (if (= path "/search")
          (try
            (search-handler store exchange)
            (catch Exception _
              (send-json! exchange 500 {"error" "The dm+d search could not be completed."})))
          (send-json! exchange 404 {"error" "Not found."}))))))

(defn -main [& _]
  (let [database-path (System/getenv "DMD_DB_PATH")
        host (or (System/getenv "DMD_HOST") "127.0.0.1")
        port (Integer/parseInt (or (System/getenv "DMD_PORT") "8081"))]
    (when (str/blank? database-path)
      (throw (ex-info "Set DMD_DB_PATH to an installed dm+d database." {})))
    (let [store (dmd/open-store database-path)
          server (HttpServer/create (InetSocketAddress. host port) 0)]
      (.createContext server "/" (handler store))
      (.setExecutor server (Executors/newFixedThreadPool 4))
      (.addShutdownHook (Runtime/getRuntime)
                        (Thread. (fn []
                                   (.stop server 1)
                                   (dmd/close store))))
      (.start server)
      (println (str "dm+d prefix-search API listening on http://" host ":" port)))))