import { Module } from "@medusajs/framework/utils"
import XeroModuleService from "./service"

export const XERO_MODULE = "xero"

export default Module(XERO_MODULE, {
  service: XeroModuleService,
})
