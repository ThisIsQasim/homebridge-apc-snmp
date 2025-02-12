var snmp = require("net-snmp");

module.exports = (api) => {
    api.registerAccessory('ups', UPS);
};


class UPS {
    services = []
    getServices() {
        return this.services;
    }

    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.session = snmp.createSession(this.config.address, this.config.community);
        this.oids = {
            "model": "1.3.6.1.4.1.318.1.1.1.1.1.1.0",
            "manufacturer": "APC",
            "serial_number": "1.3.6.1.4.1.318.1.1.1.1.2.3.0",
            "firmware_rev": "1.3.6.1.4.1.318.1.1.1.1.2.1.0",
            "out_volt": "1.3.6.1.4.1.318.1.1.1.4.2.1.0",
            "bat_capacity": "1.3.6.1.4.1.318.1.1.1.2.2.1.0",
            "bat_status": "1.3.6.1.4.1.318.1.1.1.2.1.1.0",
            "time_on_bat": "1.3.6.1.4.1.318.1.1.1.2.1.2.0",
            "alarm_state": "1.3.6.1.4.1.318.1.1.1.5.2.4.0",
            "selftest_state": "1.3.6.1.4.1.318.1.1.1.7.2.3.0",
            "temp": "1.3.6.1.4.1.318.1.1.1.2.2.2.0",
            "turn_on": {"oid": "1.3.6.1.4.1.318.1.1.1.6.2.6.0", "type": snmp.ObjectType.INTEGER, "value": 2},
            "turn_off": {"oid": "1.3.6.1.4.1.318.1.1.1.6.2.1.0", "type": snmp.ObjectType.INTEGER, "value": 2},
            "turn_off_graceful": {"oid": "1.3.6.1.4.1.318.1.1.1.6.2.1.0", "type": snmp.ObjectType.INTEGER, "value": 3},
            "alarm_on": {"oid": "1.3.6.1.4.1.318.1.1.1.5.2.4.0", "type": snmp.ObjectType.INTEGER, "value": 1},
            "alarm_off": {"oid": "1.3.6.1.4.1.318.1.1.1.5.2.4.0", "type": snmp.ObjectType.INTEGER, "value": 3},
            "start_selftest": {"oid": "1.3.6.1.4.1.318.1.1.1.7.2.2.0", "type": snmp.ObjectType.INTEGER, "value": 2}
        };

        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        this.name = this.config.name;

        this.informationService = new this.Service.AccessoryInformation()
            .setCharacteristic(this.Characteristic.Manufacturer, "APC")
        this.informationService.getCharacteristic(this.Characteristic.Model)
            .onGet(this.getModelHandler.bind(this))
        this.informationService.getCharacteristic(this.Characteristic.SerialNumber)
            .onGet(this.getSerialNumberHandler.bind(this))
        this.informationService.getCharacteristic(this.Characteristic.FirmwareRevision)
            .onGet(this.getFirmwareRevHandler.bind(this))

        var that = this
        for (const [key, value] of Object.entries(this.oids)) {
            if (key === "model" || key === "serial_number" || key === "firmware_rev") {
                this.session.get([value], function (error, varbinds) {
                    if (error) {
                        that.log.error(error);
                    } else {
                        if (snmp.isVarbindError(varbinds[0])) {
                            that.log.error(snmp.varbindError(varbinds[0]));
                        } else {
                            if (key === "model") {
                                that.log("Model: " + varbinds[0].value.toString());
                                that.log("Manufacturer: " + "APC")
                            } else if (key === "serial_number") {
                                that.log("Serial Number: " + varbinds[0].value.toString());
                            } else if (key === "firmware_rev") {
                                that.log("Firmware Rev.: " + varbinds[0].value.toString());
                            }
                        }
                    }
                });
            }
        }

        this.batteryService = new this.Service.Battery(this.name)
        this.batteryService.getCharacteristic(this.Characteristic.StatusLowBattery)
            .onGet(this.getLowBatteryHandler.bind(this))
        this.batteryService.getCharacteristic(this.Characteristic.BatteryLevel)
            .onGet(this.getBatteryLevelHandler.bind(this));
        this.batteryService.getCharacteristic(this.Characteristic.ChargingState)
            .onGet(this.getBatteryChargingStateHandler.bind(this));

        this.switchService = new this.Service.Switch(this.name);
        this.switchService.getCharacteristic(this.Characteristic.On)
            .onGet(this.getPowerStateHandler.bind(this))
            .onSet(this.setPowerStateHandler.bind(this));

        this.gracefulSwitchService = new this.Service.Switch(this.name + " (Graceful)", "Graceful");
        this.gracefulSwitchService.getCharacteristic(this.Characteristic.On)
            .onGet(this.getPowerStateHandler.bind(this))
            .onSet(this.setGracefulPowerStateHandler.bind(this));

        this.alarmSwitchService = new this.Service.Switch(this.name + " Alarm", "Alarm");
        this.alarmSwitchService.getCharacteristic(this.Characteristic.On)
            .onGet(this.getAlarmStateHandler.bind(this))
            .onSet(this.setAlarmStateHandler.bind(this));

        this.selftestSwitchService = new this.Service.Switch(this.name + " Selftest", "Selftest");
        this.selftestSwitchService.getCharacteristic(this.Characteristic.On)
            .onGet(this.getSelftestHandler.bind(this))
            .onSet(this.setSelftestHandler.bind(this));

        this.tempService = new this.Service.TemperatureSensor(this.name + " Temperature");
        this.tempService.getCharacteristic(this.Characteristic.CurrentTemperature)
            .onGet(this.getTempHandler.bind(this));


        this.services.push(this.informationService);

        if (this.config.enable_non_graceful === true) {
            this.services.push(this.switchService);
        }
        if (this.config.enable_graceful === true) {
            this.services.push(this.gracefulSwitchService)
        }
        if (this.config.enable_alarm === true) {
            this.services.push(this.alarmSwitchService)
        }
        if (this.config.enable_selftest === true) {
            this.services.push(this.selftestSwitchService)
        }
        if (this.config.enable_temp === true) {
            this.services.push(this.tempService)
        }
        if (this.config.enable_battery === true) {
            this.services.push(this.batteryService)
        }

    }

    setSnmp(oid, type, value) {
        var that = this;
        this.session.set([{oid, type, value}], function (error, varbinds) {
            if (error) {
                that.log.error(error.toString());
            } else {
                for (let i = 0; i < varbinds.length; i++) {
                    if (snmp.isVarbindError(varbinds[i]))
                        that.log.error(snmp.varbindError(varbinds[i]));
                    else
                        that.log.info("Set " + varbinds[i].oid + " to value " + varbinds[i].value);
                }
            }
        });
    }

    async getSelftestHandler() {
        this.log.debug('Triggered GET getSelftestHandler');
        var that = this
        this.session.get([this.oids.selftest_state], function (error, varbinds) {
            if (error) {
                that.log.error(error);
            } else {
                if (snmp.isVarbindError(varbinds[0])) {
                    that.log.error(snmp.varbindError(varbinds[0]));
                } else {
                    that.selftest_state = varbinds[0].value.toString();
                }
            }
        });
        return this.selftest_state > 3;
    }

    async setSelftestHandler(value) {
        this.log.debug('Triggered SET setSelftestHandler');
        if (value === true) {
            this.setSnmp(this.oids.start_selftest.oid, this.oids.start_selftest.type, this.oids.start_selftest.value);
        }
    }

    async getPowerStateHandler() {
        this.log.debug('Triggered GET getPowerStateHandler');
        var that = this
        this.session.get([this.oids.out_volt], function (error, varbinds) {
            if (error) {
                that.log.error(error);
            } else {
                if (snmp.isVarbindError(varbinds[0])) {
                    that.log.error(snmp.varbindError(varbinds[0]));
                } else {
                    that.out_volt = varbinds[0].value.toString();
                }
            }
        });
        return this.out_volt >= 10;
    }

    async setPowerStateHandler(value) {
        this.log.debug('Triggered SET setPowerStateHandler');
        if (value === true) {
            this.setSnmp(this.oids.turn_on.oid, this.oids.turn_on.type, this.oids.turn_on.value);
        } else {
            this.setSnmp(this.oids.turn_off.oid, this.oids.turn_off.type, this.oids.turn_off.value);
        }
    }

    async setGracefulPowerStateHandler(value) {
        this.log.debug('Triggered SET setGracefulPowerStateHandler');
        if (value === true) {
            this.setSnmp(this.oids.turn_on.oid, this.oids.turn_on.type, this.oids.turn_on.value);
        } else {
            this.setSnmp(this.oids.turn_off_graceful.oid, this.oids.turn_off_graceful.type, this.oids.turn_off_graceful.value);
        }
    }

    async getAlarmStateHandler() {
        this.log.debug('Triggered GET getAlarmStateHandler');
        var that = this
        this.session.get([this.oids.alarm_state], function (error, varbinds) {
            if (error) {
                that.log.error(error);
            } else {
                if (snmp.isVarbindError(varbinds[0])) {
                    that.log.error(snmp.varbindError(varbinds[0]));
                } else {
                    that.alarm_state = varbinds[0].value.toString();
                }
            }
        });
        return this.alarm_state <= 2;
    }

    async setAlarmStateHandler(value) {
        this.log.debug('Triggered SET setAlarmStateHandler');
        if (value === true) {
            this.setSnmp(this.oids.alarm_on.oid, this.oids.alarm_on.type, this.oids.alarm_on.value);
        } else {
            this.setSnmp(this.oids.alarm_off.oid, this.oids.alarm_off.type, this.oids.alarm_off.value);
        }
    }

    async getLowBatteryHandler() {
        this.log.debug('Triggered GET getLowBatteryHandler');
        var that = this
        this.session.get([this.oids.bat_status], function (error, varbinds) {
            if (error) {
                that.log.error(error);
            } else {
                if (snmp.isVarbindError(varbinds[0])) {
                    that.log.error(snmp.varbindError(varbinds[0]));
                } else {
                    that.bat_status = varbinds[0].value.toString();
                }
            }
        });

        if (this.bat_status <= 2) {
            return 0
        } else if (this.bat_status === 3) {
            return 1
        } else {
            return 0
        }
    }

    async getTempHandler() {
        this.log.debug('Triggered GET getTempHandler');
        var that = this
        this.session.get([this.oids.temp], function (error, varbinds) {
            if (error) {
                that.log.error(error);
            } else {
                if (snmp.isVarbindError(varbinds[0])) {
                    that.log.error(snmp.varbindError(varbinds[0]));
                } else {
                    that.temp = varbinds[0].value.toString();
                }
            }
        });
        return this.temp;
    }

    async getBatteryLevelHandler() {
        this.log.debug('Triggered GET getBatteryLevelHandler');
        var that = this
        this.session.get([this.oids.bat_capacity], function (error, varbinds) {
            if (error) {
                that.log.error(error);
            } else {
                if (snmp.isVarbindError(varbinds[0])) {
                    that.log.error(snmp.varbindError(varbinds[0]));
                } else {
                    that.bat_capacity = varbinds[0].value.toString();
                }
            }
        });
        return this.bat_capacity;
    }

    async getBatteryChargingStateHandler() {
        this.log.debug('Triggered GET getBatteryChargingStateHandler');
        var that = this
        this.session.get([this.oids.time_on_bat], function (error, varbinds) {
            if (error) {
                that.log.error(error);
            } else {
                if (snmp.isVarbindError(varbinds[0])) {
                    that.log.error(snmp.varbindError(varbinds[0]));
                } else {
                    that.time_on_bat = varbinds[0].value.toString();
                }
            }
        });
        if (this.time_on_bat === "0") {
            return 1;

        } else {
            return 0;
        }
    }

    async getModelHandler() {
        this.log.debug('Triggered GET getModelHandler');
        var that = this
        return await new Promise(function (resolve, reject) {
            that.session.get([that.oids.model], function (error, varbinds) {
                if (error) {
                    that.log.error(error);
                    reject(error)
                } else {
                    if (snmp.isVarbindError(varbinds[0])) {
                        that.log.error(snmp.varbindError(varbinds[0]));
                        reject(error)
                    } else {
                        var value = varbinds[0].value.toString()
                        resolve(value)
                    }
                }
            });
        });
    }

    async getSerialNumberHandler() {
        this.log.debug('Triggered GET getSerialNumberHandler');
        var that = this
        return await new Promise(function (resolve, reject) {
            that.session.get([that.oids.serial_number], function (error, varbinds) {
                if (error) {
                    that.log.error(error);
                    reject(error)
                } else {
                    if (snmp.isVarbindError(varbinds[0])) {
                        that.log.error(snmp.varbindError(varbinds[0]));
                        reject(error)
                    } else {
                        var value = varbinds[0].value.toString()
                        resolve(value)
                    }
                }
            });
        });
    }

    async getFirmwareRevHandler() {
        this.log.debug('Triggered GET getFirmwareRevHandler');
        var that = this
        return await new Promise(function (resolve, reject) {
            that.session.get([that.oids.firmware_rev], function (error, varbinds) {
                if (error) {
                    that.log.error(error);
                    reject(error)
                } else {
                    if (snmp.isVarbindError(varbinds[0])) {
                        that.log.error(snmp.varbindError(varbinds[0]));
                        reject(error)
                    } else {
                        var value = varbinds[0].value.toString()
                        resolve(value)
                    }
                }
            });
        });
    }

}
