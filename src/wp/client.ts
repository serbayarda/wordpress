import axios, { AxiosInstance } from "axios";
import type { BrandConfig } from "../types.js";

export function wpClient(brand: BrandConfig): AxiosInstance {
  const auth = Buffer.from(
    `${brand.wordpress.username}:${brand.wordpress.applicationPassword}`,
  ).toString("base64");
  return axios.create({
    baseURL: `${brand.wordpress.baseUrl.replace(/\/$/, "")}/wp-json/wp/v2`,
    headers: { Authorization: `Basic ${auth}` },
    timeout: 60_000,
  });
}
