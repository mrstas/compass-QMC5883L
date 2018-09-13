'use strict';

/**
* QMC5883L
* http://wiki.epalsite.com/images/7/72/QMC5883L-Datasheet-1.0.pdf
*
*
* Based on code from: https://github.com/psiphi75/compass-hmc5883l
* and https://github.com/dthain/QMC5883L
*
*/




var QMC5883L_ADDR = 0x0D;

/* Register numbers */
var QMC5883L_X_LSB = 0;
var QMC5883L_X_MSB = 1;
var QMC5883L_Y_LSB = 2;
var QMC5883L_Y_MSB = 3;
var QMC5883L_Z_LSB = 4;
var QMC5883L_Z_MSB = 5;
var QMC5883L_STATUS = 6;
var QMC5883L_TEMP_LSB = 7;
var QMC5883L_TEMP_MSB = 8;
var QMC5883L_CONFIG = 9;
var QMC5883L_CONFIG2 = 10;
var QMC5883L_RESET = 11;
var QMC5883L_RESERVED = 12;
var QMC5883L_CHIP_ID = 13;

/* Bit values for the STATUS register */
var QMC5883L_STATUS_DRDY = 1;
var QMC5883L_STATUS_OVL = 2;
var QMC5883L_STATUS_DOR = 4;


/* Mode values for the CONFIG register */
var QMC5883L_CONFIG_STANDBY = 0b00000000;
var QMC5883L_CONFIG_CONT = 0b00000001;


/*
var xhigh = 900;
var yhigh = 1600;
var xlow = -900;
var ylow = -400;
*/
var xhigh = 0;
var yhigh = 0;
var xlow = 0;
var ylow = 0;




var DEFAULT_OVERSAMPLING = '64';
var oversamplingMap = {
  '512': 0b00000000, /* Default value */
  '256': 0b01000000,
  '128': 0b10000000,
  '64': 0b11000000
};

var DEFAULT_SAMPLE_RATE = '10HZ';
var sampleRateMap = {
  '10HZ': 0b00000000, /* Default value */
  '50HZ': 0b00000100,
  '100HZ': 0b00001000,
  '200HZ': 0b00001100
};


var DEFAULT_SCALE = '8G';
var scaleMap = {
  '2G': 0b00000000, /* Default value */
  '8G': 0b00010000
};


function twos_complement(val, bits) {
  if ((val & (1 << (bits - 1))) !== 0) {
    val = val - (1 << bits);
  }
  return val;
}


/**
 * Initalise the compass.
 * @param {number}   i2cBusNum The i2c bus number.
 * @param {object}  options   The additional options.
 *
 * Options:
 *   i2c: the i2c library (such that we don't have to load it twice).
 *   scale (string): The scale range to use.  See pp13 of the technical documentation.  Default is '0.88'.
 *   sampleRate (string): The sample rate (Hz), must be one of .  Default is '15' Hz (samples per second).
 *   declination (number): The declination, in degrees.  If this is provided the result will be true north, as opposed to magnetic north.
 */
function Compass(i2cBusNum, options) {

  if (typeof i2cBusNum !== 'number') {
    throw new Error('Compass: i2cBusNum must be a number.');
  }

  if (!options) {
    options = {};
  }
  this.i2c = (options.i2c || require('i2c-bus')).openSync(i2cBusNum);


  //check if defice is present
  try {
    this.i2c.receiveByteSync(QMC5883L_ADDR);
  } catch (e) {
    throw new Error('Compass: no device found ');
  }
  // Set up the scale setting
  this.scale = scaleMap[options.scale || DEFAULT_SCALE];
  // Set up the sample rate
  this.sampleRate = sampleRateMap[options.sampleRate || DEFAULT_SAMPLE_RATE];
  // Set up the oversampling
  this.oversampling = oversamplingMap[options.oversampling || DEFAULT_OVERSAMPLING];
  //continuous mode
  this.mode = QMC5883L_CONFIG_CONT;
  //reset compass
  this.i2c.writeByteSync(QMC5883L_ADDR, QMC5883L_RESET, 0x01);
  // set working parameters
  this.i2c.writeByteSync(QMC5883L_ADDR, QMC5883L_CONFIG, this.oversampling | this.scale | this.sampleRate | this.mode);
  // Set up declination, default to zero.
  if (!options.declination) {
    options.declination = 0;
  }
  this.declination = options.declination / 180 * Math.PI;
}

/**
 * Get the scaled and calibrated values from the compass.
 * @param  {Function} callback The standard callback -> (err, {x:number, y:number, z:number})
 */
Compass.prototype.getRawValues = function(callback) {
  var BUF_LEN = 6;
  var buf = new Buffer(BUF_LEN);
  var self = this;

  try {
    while (!self.CheckQMC5883Lready()) {
    }
    ;
    self.i2c.readI2cBlock(QMC5883L_ADDR, QMC5883L_X_LSB, BUF_LEN, buf, i2cCallback);
  } catch (ex) {
    console.error('ERROR: Compass.getRawValues(): error with i2c.writeByte() or i2c.readI2cBlock: ', ex);
    if (callback) {
      callback(ex);
    }
    callback = null;
  }

  function i2cCallback(err) {
    if (err) {
      if (callback) {
        callback(err);
      }
    } else {
      callback(null, {
        x: convert(0),
        y: convert(2),
        z: convert(4)
      });
    }
    callback = null;
  }

  function convert(offset) {
    var val = twos_complement(buf[offset + 1] << 8 | buf[offset], 16);
    return val;
  }
};



/**
 * Get the heading in radians, where heading is along axis1 and heading is between
 * 0 and 2 * PI.
 * @param  {Function} callback Standard callback
 * @param  {string} axis1 The first axis (determines North)
 * @param  {string} axis2 The second axis (determines West)
 */
Compass.prototype.getHeading = function(axis1, axis2, callback) {

  var self = this;
  this.getRawValues(function(err, vector) {
    if (err) {
      callback(err);
      return;
    }

    callback(null, self.calcHeading(axis1, axis2, vector));
  });
};


/**
 * Calculate the heading in radians, where heading is along axis1 and heading is between
 * 0 and 2 * PI.
 * @param {string} axis1 The first axis (determines North)
 * @param {string} axis2 The second axis (determines West)
 * @param {object} vector the {x, y, z} vector
 * @return the heading in radians
 */
Compass.prototype.calcHeading = function calcHeading(axis1, axis2, vector) {

  var VALID_AXIS = ['x', 'y', 'z'];
  if (VALID_AXIS.indexOf(axis1) < 0 || VALID_AXIS.indexOf(axis2) < 0 || axis1 === axis2) {
    throw new Error('Compass.getHeading(): At least of the supplied axis are not valid, they must be different and one of :', VALID_AXIS);
  }
  // console.error('xlow: ', xlow);
  // console.error('xhigh: ', xhigh);
  // console.error('ylow: ', ylow);
  // console.error('yhigh: ', yhigh);


  /* Update the observed boundaries of the measurements */
  if (xlow === xhigh && xlow === 0) {
    xlow = vector[axis1];
    xhigh = vector[axis1];
  }
  ;

  if (ylow === yhigh && ylow === 0) {
    ylow = vector[axis2];
    yhigh = vector[axis2];
  }
  ;


  if (vector[axis1] < xlow)
    xlow = vector[axis1];
  if (vector[axis1] > xhigh)
    xhigh = vector[axis1];
  if (vector[axis2] < ylow)
    ylow = vector[axis2];
  if (vector[axis2] > yhigh)
    yhigh = vector[axis2];

  /* Bail out if not enough data is available. */
  if (xlow === xhigh || ylow === yhigh) return 0;

  /* Recenter the measurement by subtracting the average */
  vector[axis1] -= (xhigh + xlow) / 2;
  vector[axis2] -= (yhigh + ylow) / 2;

  /* Rescale the measurement to the range observed. */
  var fx = vector[axis1] / (xhigh - xlow);
  var fy = vector[axis2] / (yhigh - ylow);

  var twoPies = 2 * Math.PI;
  var heading = Math.atan2(fy, fx);
  heading += this.declination;

  while (heading < 0) {
    heading += twoPies;
  }
  while (heading > twoPies) {
    heading -= twoPies;
  }


  return heading;
};

Compass.prototype.calcHeadingDegrees = function calcHeading(axis1, axis2, vector) {
  return this.calcHeading(axis1, axis2, vector) * 180 / Math.PI;
};


/**
 * Get the heading in decimal degrees, where heading is along axis1 and heading
 * is between 0 and 360 degrees.
 * @param  {Function} callback Standard callback
 * @param  {string} axis1 The first axis (determines North)
 * @param  {string} axis2 The second axis (determines West)
 */
Compass.prototype.getHeadingDegrees = function(axis1, axis2, callback) {

  this.getHeading(axis1, axis2, function(err, heading) {
    if (err) {
      callback(err, heading);
    } else {
      callback(null, heading * 180 / Math.PI);
    }
  });
};

Compass.prototype.CheckQMC5883Lready = function() {
  var self = this;
  var status = self.i2c.readByteSync(QMC5883L_ADDR, QMC5883L_STATUS);
  return status & QMC5883L_STATUS_DRDY;
};



module.exports = Compass;
