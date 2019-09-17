const { writeFile, mkdirs } = require('fs-extra');
const { sha3 } = require('web3-utils');
const { join } = require('path');
const templates = require('./templates');

const USAGE = 'Usage: truffle run dist';
const DIST_DIR = 'dist';

function getContracts(schema, buildPath) {
  return Object.keys(schema || {})
    .map((name) => {
      let result = null;
      let options = schema[name];

      if (options && typeof options === 'object') {
        options = {
          abi: false,
          addresses: false,
          byteCodeHash: false,
          ...options,
        };
      } else if (!!options) {
        options = {
          abi: true,
          addresses: true,
          byteCodeHash: true,
        };
      } else {
        options = null;
      }

      if (options) {
        const path = join(buildPath, `${options.contract || name}.json`);

        let build = null;
        try {
          build = require(path);
        } catch (err) {
          build = null;
        }

        if (build) {
          result = {
            name,
            options,
            build: {
              abi: null,
              bytecode: null,
              networks: {},
              ...build,
            },
          };
        }
      }

      return result;
    })
    .filter(value => !!value);
}

function getNetworkIds(networks) {
  return Object.values(networks)
    .reduce((result, { network_id }) => {
      return !parseInt(network_id)
        ? result
        : [
          ...result,
          network_id,
        ];
    }, []);
}

function getData(distPath) {
  let result = {};

  try {
    result = require(join(distPath, 'data.js'));
  } catch (err) {
    result = {};
  }

  return result;
}

module.exports = async (config) => {
  const {
    help,
    networks,
    logger,
    dist: schema,
    working_directory: workingPath,
    contracts_build_directory: buildPath,
    _,
  } = config;

  if (help) {
    logger.log(USAGE);
    return;
  }

  const distPath = join(workingPath, DIST_DIR);
  const contracts = getContracts(schema, buildPath);
  const networkIds = getNetworkIds(networks);

  const data = {};
  const oldData = getData(distPath);

  for (const { name, options, build } of contracts) {
    const oldItem = {
      abi: null,
      addresses: {},
      byteCodeHash: null,
      ...(oldData[name] || {}),
    };

    const newItem = {
      abi: null,
      addresses: {},
      byteCodeHash: null,
    };

    if (options.abi) {
      newItem.abi = build.abi || oldItem.abi || null;
    }

    if (options.byteCodeHash) {
      newItem.byteCodeHash = build.bytecode
        ? sha3(build.bytecode)
        : oldItem.abi || null;
    }

    if (options.addresses) {
      for (const networkId of networkIds) {
        newItem.addresses[networkId] = build.networks[networkId]
          ? build.networks[networkId].address
          : oldItem.addresses[networkId] || null;
      }
    }

    data[name] = newItem;
  }

  await mkdirs(DIST_DIR);

  await writeFile(join(distPath, 'index.js'), templates.indexJs(contracts));
  await writeFile(join(distPath, 'index.d.ts'), templates.indexDTs(contracts));
  await writeFile(join(distPath, 'data.js'), templates.dataJs(data));
};
