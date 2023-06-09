'use strict';
const {
  codes: {
    ERR_TEST_FAILURE,
  },
} = require('internal/errors');
const AssertionError = require('internal/assert/assertion_error');
const {
  ArrayPrototypeJoin,
  ArrayPrototypePush,
  Error,
  Number,
  NumberIsNaN,
  RegExpPrototypeExec,
  StringPrototypeEndsWith,
  StringPrototypeRepeat,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
  StringPrototypeSubstring,
} = primordials;

const kYamlKeyRegex = /^(\s+)?(\w+):(\s)+([>|][-+])?(.*)$/;
const kStackDelimiter = '    at ';

function reConstructError(parsedYaml) {
  if (!('error' in parsedYaml)) {
    return parsedYaml;
  }
  const isAssertionError = parsedYaml.code === 'ERR_ASSERTION' ||
    'actual' in parsedYaml || 'expected' in parsedYaml || 'operator' in parsedYaml;
  const isTestFailure = parsedYaml.code === 'ERR_TEST_FAILURE' || 'failureType' in parsedYaml;
  const stack = parsedYaml.stack ? kStackDelimiter + ArrayPrototypeJoin(parsedYaml.stack, `\n${kStackDelimiter}`) : '';
  let error, cause;

  if (isAssertionError) {
    cause = new AssertionError({
      message: parsedYaml.error,
      actual: parsedYaml.actual,
      expected: parsedYaml.expected,
      operator: parsedYaml.operator,
    });
  } else {
    // eslint-disable-next-line no-restricted-syntax
    cause = new Error(parsedYaml.error);
  }
  const name = parsedYaml.name ?? 'Error';
  cause.stack = `${name}: ${parsedYaml.error}\n${stack}`;

  if (!isAssertionError && !isTestFailure) {
    cause.code = parsedYaml.code;
  }

  if (isTestFailure) {
    error = new ERR_TEST_FAILURE(cause, parsedYaml.failureType);
    error.stack = stack;
  }

  parsedYaml.error = error ?? cause;
  delete parsedYaml.stack;
  delete parsedYaml.code;
  delete parsedYaml.failureType;
  delete parsedYaml.actual;
  delete parsedYaml.expected;
  delete parsedYaml.operator;

  return parsedYaml;
}

function getYamlValue(value) {
  if (StringPrototypeStartsWith(value, "'") && StringPrototypeEndsWith(value, "'")) {
    return StringPrototypeSlice(value, 1, -1);
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value !== '') {
    const valueAsNumber = Number(value);
    return NumberIsNaN(valueAsNumber) ? value : valueAsNumber;
  }
  return value;
}

// This parses the YAML generated by the built-in TAP reporter,
// which is a subset of the full YAML spec. There are some
// YAML features that won't be parsed here. This function should not be exposed publicly.
function YAMLToJs(lines) {
  if (lines == null) {
    return undefined;
  }
  const result = { __proto__: null };
  let isInYamlBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isInYamlBlock && !StringPrototypeStartsWith(line, StringPrototypeRepeat(' ', isInYamlBlock.indent))) {
      result[isInYamlBlock.key] = isInYamlBlock.key === 'stack' ?
        result[isInYamlBlock.key] : ArrayPrototypeJoin(result[isInYamlBlock.key], '\n');
      isInYamlBlock = false;
    }
    if (isInYamlBlock) {
      const blockLine = StringPrototypeSubstring(line, isInYamlBlock.indent);
      ArrayPrototypePush(result[isInYamlBlock.key], blockLine);
      continue;
    }
    const match = RegExpPrototypeExec(kYamlKeyRegex, line);
    if (match !== null) {
      const { 1: leadingSpaces, 2: key, 4: block, 5: value } = match;
      if (block) {
        isInYamlBlock = { key, indent: (leadingSpaces?.length ?? 0) + 2 };
        result[key] = [];
      } else {
        result[key] = getYamlValue(value);
      }
    }
  }
  return reConstructError(result);
}

module.exports = {
  YAMLToJs,
};