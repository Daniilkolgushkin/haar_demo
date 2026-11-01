#include "haar.hpp"
#include <algorithm>
#include <bit>
#include <cmath>
#include <stdexcept>
namespace haar {
constexpr float h = 0.7071067811865475244f;
Signal pad(std::span<const float> x) {
    if(x.empty() || x.size()>max_padded || !std::all_of(x.begin(),x.end(),[](float v){return std::isfinite(v);}))
        throw std::invalid_argument("Invalid PCM or input exceeds 2^23 samples per channel");
    Signal y(std::bit_ceil(x.size()));
    for(std::size_t i=0;i<y.size();++i) {
        const auto k=i%(2*x.size());
        y[i]=x[k<x.size()?k:2*x.size()-1-k];
    }
    return y;
}
void dwt(Signal& x) {
    if(!std::has_single_bit(x.size())) throw std::invalid_argument("DWT length must be dyadic");
    Signal tmp(x.size());
    for(auto n=x.size();n>1;n/=2) {
        for(std::size_t k=0;k<n/2;++k) { tmp[k]=(x[2*k]+x[2*k+1])*h;tmp[n/2+k]=(x[2*k]-x[2*k+1])*h; }
        std::copy_n(tmp.begin(),n,x.begin());
    }
}
void idwt(Signal& x) {
    if(!std::has_single_bit(x.size())) throw std::invalid_argument("IDWT length must be dyadic");
    Signal tmp(x.size());
    for(std::size_t n=1;n<x.size();n*=2) {
        for(std::size_t k=0;k<n;++k) { tmp[2*k]=(x[k]+x[n+k])*h;tmp[2*k+1]=(x[k]-x[n+k])*h; }
        std::copy_n(tmp.begin(),2*n,x.begin());
    }
}
Session::Session(const std::vector<Signal>& channels) {
    if(channels.empty()||channels.size()>2) throw std::invalid_argument("Expected mono or stereo");
    n=channels[0].size();
    for(const auto& x:channels) {
        if(x.size()!=n) throw std::invalid_argument("Channel lengths differ");
        coefficients.push_back(pad(x));dwt(coefficients.back());
    }
    m=coefficients[0].size();
}
std::size_t Session::rows() const { return std::bit_width(m); }
std::vector<Signal> Session::reconstruct(std::span<const uint8_t> off,std::span<const uint32_t> exceptions) const {
    if(off.size()!=rows() || std::any_of(exceptions.begin(),exceptions.end(),[&](auto k){return k>=m;})) throw std::invalid_argument("Invalid mask");
    std::vector<Signal> result;
    for(const auto& original:coefficients) {
        auto c=original;
        for(std::size_t r=0;r<rows();++r) if(off[r]) {
            const std::size_t lo=r?std::size_t{1}<<(r-1):0, hi=std::size_t{1}<<r;
            std::fill(c.begin()+lo,c.begin()+hi,0);
        }
        for(auto k:exceptions) c[k]=off[std::bit_width(k)]?original[k]:0;
        idwt(c);c.resize(n);result.push_back(std::move(c));
    }
    return result;
}
Signal Session::bins(std::size_t start,std::size_t end,std::size_t width) const {
    width=std::clamp(width,std::size_t{1},std::size_t{4096});start=std::min(start,n-1);end=std::clamp(end,start+1,n);
    Signal output(rows()*width);
    for(std::size_t r=0;r<rows();++r) {
        const std::size_t offset=r?std::size_t{1}<<(r-1):0, count=r?offset:1, support=m/count;
        for(std::size_t p=0;p<width;++p) {
            const auto lo=(start+p*(end-start)/width)/support;
            const auto hi=std::min(count,(start+((p+1)*(end-start)+width-1)/width+support-1)/support);
            double energy=0;
            for(const auto& c:coefficients) for(auto k=lo;k<hi;++k) energy+=double(c[offset+k])*c[offset+k];
            output[r*width+p]=std::sqrt(energy/double((hi-lo)*support*coefficients.size()));
        }
    }
    return output;
}
float peak_guard(std::vector<Signal>& channels) {
    float peak=0;for(const auto& c:channels) for(auto v:c) peak=std::max(peak,std::abs(v));
    const float gain=peak>1?0.999f/peak:1;
    if(gain<1) for(auto& c:channels) for(auto& v:c) v*=gain;
    return gain;
}
}
