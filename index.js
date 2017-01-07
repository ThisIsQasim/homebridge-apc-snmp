var Service, Characteristic;
var apcUps = require("./snmp.js");
var ipaddress = require("./ipaddress");
var ups = new apcUps(ipaddress);

const DEF_MIN_TEMPERATURE = -100,
      DEF_MAX_TEMPERATURE = 100,
      DEF_TIMEOUT = 5000;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-apc-snmp", "APC", APCAccessory);
}

function APCAccessory(log, config) {
    this.log = log;
    this.name = config["name"];
    this.location = config["location"];
    this.model = config["model"] || "Model not available";
    this.serial = config["serial"] || "Non-defined serial";
    this.minTemperature = config["min_temp"] || DEF_MIN_TEMPERATURE;
    this.maxTemperature = config["max_temp"] || DEF_MAX_TEMPERATURE;
    this.temperature = 0.0;
    this.service = "Temperature Sensor";
}
APCAccessory.prototype = {
   getTemperature: function(callback) {
       ups.getTemperature(function(temperature) {
	       console.log(temperature);
	       console.log(((temperature * 9) / 5) + 32);    
	       var ftemp = temperature * 9 / 5 + 32;
               console.log(ftemp);
	       callback(temperature);
             
   });

   },
   identify: function(callback) {
 this.log("Identify requested!");
        callback(); // success
   },

   getServices: function () {
      var informationService = new Service.AccessoryInformation();
      informationService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serial);
	   
if (this.service == "Temperature Sensor") {
      			temperatureService = new Service.TemperatureSensor("Room Temperature");
			temperatureService
			        .getCharacteristic(Characteristic.CurrentTemperature)
			        .on('get', this.getTemperature.bind(this));


	return [informationService, temperatureService];
		}
	}
};
