'use strict';

var heading0;
var heading1;

var Compass = require('compass-hmc5883l');
var compass = new Compass(1);


var Compass0 = require('compass-hmc5883l');
var compass0 = new Compass(0);


// Gets called every time we get the values.
function printHeadingCB(err, heading) {
  if (err) {
    console.log(err);
    return;
  }
  heading1 = heading.toFixed(0);
}

function printHeadingCB0(err, heading) {
  if (err) {
    console.log(err);
    return;
  }
  heading0 = heading.toFixed(0);
}

// Get the compass values every 100 milliseconds
setInterval(function() {
  compass.getHeadingDegrees('x', 'y', printHeadingCB);
  compass0.getHeadingDegrees('x', 'y', printHeadingCB0);
  console.log(`heading0: ${heading0}   heading1: ${heading1}`);
}, 100);




//
// var Compass = require('compass-hmc5883l');
// var compass = new Compass(2);
//
// // Get the compass values
// compass.getHeading('x', 'y', function (err, heading) {
//     console.log(heading * 180 / Math.PI);
// });
//
