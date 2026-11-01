#pragma once
#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>
namespace haar {
#ifndef HAAR_MAX_PADDED
#error "Define HAAR_MAX_PADDED from config.json when compiling"
#endif
inline constexpr std::size_t max_padded = HAAR_MAX_PADDED;
using Signal = std::vector<float>;
Signal pad(std::span<const float>);
void dwt(Signal&);
void idwt(Signal&);
struct Session {
    std::size_t n, m;
    std::vector<Signal> coefficients;
    explicit Session(const std::vector<Signal>& channels);
    std::size_t rows() const;
    std::vector<Signal> reconstruct(std::span<const uint8_t> off, std::span<const uint32_t> exceptions) const;
    Signal bins(std::size_t start, std::size_t end, std::size_t width) const;
};
float peak_guard(std::vector<Signal>&);
}
