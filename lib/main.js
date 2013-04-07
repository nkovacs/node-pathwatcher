var binding = require('../build/Release/pathwatcher.node');
var events = require('events');
var fs = require('fs');
var util = require('util');

var handleWatchers = {};

function dispatch(event, handle, path) {
  if (!handle in handleWatchers)
    throw new Error('Emitting events for ' + path + ' while no one is listening to it');

  handleWatchers[handle].onEvent(event, path);
}

binding.setCallback(dispatch);

function HandleWatcher(path) {
  this.path = path;
  this.start();
}

util.inherits(HandleWatcher, events.EventEmitter);

HandleWatcher.prototype.onEvent = function(event, path) {
  if (event == 'rename') {
    var self = this;

    // Detect atomic write.
    this.close();
    setTimeout(function() {
      fs.stat(self.path, function(err) {
        if (err) { // original file is gone it's a rename.
          self.path = path;
          self.start();
          self.emit('change', 'rename', path);
        } else { // atomic write.
          self.start();
          self.emit('change', 'change', null);
        }
      });
    }, 100);
    return;
  } else if (event == 'delete') {
    this.close();
  }

  this.emit('change', event, path);
}

HandleWatcher.prototype.start = function() {
  this.handle = binding.watch(this.path);
  handleWatchers[this.handle] = this;
}

HandleWatcher.prototype.closeIfNoListener = function() {
  if (this.listeners('change').length == 0)
    this.close();
}

HandleWatcher.prototype.close = function() {
  handleWatchers[this.handle] = undefined;
  binding.unwatch(this.handle);
}

function PathWatcher(path, callback) {
  this.handleWatcher = null;
  for (var i = 0; i < handleWatchers.length; ++i)
    if (handleWatchers[i].path == path) {
      this.handleWatcher = handleWatchers[i];
      break;
    }

  if (!this.handleWatcher) {
    this.handleWatcher = new HandleWatcher(path);
  }

  this.onChange = function(event, path) {
    if (typeof callback == 'function') callback.call(this, event, path);
    this.emit('change', event, path);
  }.bind(this);

  this.handleWatcher.on('change', this.onChange);
}

util.inherits(PathWatcher, events.EventEmitter);

PathWatcher.prototype.close = function() {
  this.handleWatcher.removeListener('change', this.onChange);
  this.handleWatcher.closeIfNoListener();
}

exports.watch = function(path, callback) {
  path = require('path').resolve(path);
  return new PathWatcher(path, callback);
}
