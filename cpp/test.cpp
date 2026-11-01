#include "haar.hpp"
#include <cassert>
#include <cmath>
#include <iostream>
#include <random>
#include <string>
using namespace haar;
void near(const Signal& a,const Signal& b) {
    assert(a.size()==b.size());for(std::size_t k=0;k<a.size();++k) assert(std::abs(a[k]-b[k])<1e-4);
}
int main(int argc,char**) {
    if(argc>1) { Signal x;float v;while(std::cin>>v)x.push_back(v);dwt(x);std::cout.precision(9);for(auto c:x)std::cout<<c<<' ';return 0; }
    Signal known{1,2,3,4};dwt(known);near(known,{5,-2,-std::sqrt(.5f),-std::sqrt(.5f)});
    near(pad(Signal{1,2,3}),{1,2,3,3});near(pad(Signal{1,2,3,4,5}),{1,2,3,4,5,5,4,3});near(pad(Signal{2}),{2});
    std::mt19937 rng(17);std::uniform_real_distribution<float> random(-.5,.5);
    for(auto n:{1,2,3,7,8,1000,65537}) {
        Signal x(n);for(auto& v:x)v=random(rng);auto p=pad(x),c=p;dwt(c);
        double ep=0,ec=0;for(auto v:p)ep+=double(v)*v;for(auto v:c)ec+=double(v)*v;
        assert(std::abs(ep-ec)<ep*2e-6+1e-8);idwt(c);near(p,c);c.resize(n);near(x,c);
    }
    Session constant({Signal(7,.25f)});near(Signal(constant.coefficients[0].begin()+1,constant.coefficients[0].end()),Signal(7,0));
    near(constant.reconstruct(std::vector<uint8_t>{1,0,0,0},{} )[0],Signal(7,0));
    near(constant.reconstruct(std::vector<uint8_t>(4,1),{})[0],Signal(7,0));
    near(constant.reconstruct(std::vector<uint8_t>(4,1),std::vector<uint32_t>{0})[0],Signal(7,.25f));
    near(constant.reconstruct(std::vector<uint8_t>(4,0),{})[0],Signal(7,.25f));
    Signal impulse{1,0,0,0};dwt(impulse);near(impulse,{.5,.5,std::sqrt(.5f),0});
    Signal step{0,0,1,1};dwt(step);near(step,{1,-1,0,0});
    Session stereo({{1,2,3,4},{0,0,0,0}});auto result=stereo.reconstruct(std::vector<uint8_t>(3,0),std::vector<uint32_t>{2});
    near(result[0],{1.5,1.5,3,4});near(result[1],Signal(4,0));
    near(stereo.reconstruct(std::vector<uint8_t>(3,1),std::vector<uint32_t>{2})[0],{-.5,.5,0,0});
    std::vector<Signal> loud{{2,-1},{.5,0}};assert(std::abs(peak_guard(loud)-.4995)<1e-6);near(loud[1],{.24975,0});
    Session one({{.2f}});near(one.reconstruct(std::vector<uint8_t>{0},{})[0],{.2f});
    auto b=constant.bins(0,7,17);near(Signal(b.begin(),b.begin()+17),Signal(17,.25f));
    for(auto v:b)assert(std::isfinite(v));
    bool caught=false;try{pad(Signal{});}catch(...){caught=true;}assert(caught);
    caught=false;try{Session bad({{1},{1,2}});}catch(...){caught=true;}assert(caught);
    caught=false;try{stereo.reconstruct(std::vector<uint8_t>(3,0),std::vector<uint32_t>{4});}catch(...){caught=true;}assert(caught);
    std::cout<<"C++: known vectors, reflection, random roundtrip/Parseval, masks, support, stereo, gain, bins, validation passed\n";
}
