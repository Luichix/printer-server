function extractWeightLb(text) {
  const match = text.match(/(\d+\.\d+)lb/);
  return match ? parseFloat(match[1]) : null;
}

module.exports = {
  extractWeightLb,
};
